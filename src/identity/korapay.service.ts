import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IdentityVerificationResult {
  verified: boolean;
  reason?: string;
  data?: Record<string, any>;
}

interface ExpectedIdentity {
  firstName?: string;
  lastName?: string;
}

/**
 * Wraps Korapay's identity verification (eIDV) API for Nigerian NIN and BVN
 * lookups: https://developers.korapay.com/docs/nigeria-nin
 *          https://developers.korapay.com/docs/nigeria-bvn
 *
 * Both endpoints share the same request/response shape, so a single
 * `verify()` helper drives both `verifyNin` and `verifyBvn`.
 */
@Injectable()
export class KorapayService {
  private readonly logger = new Logger(KorapayService.name);
  private readonly secretKey: string | null;
  private readonly baseUrl =
    'https://api.korapay.com/merchant/api/v1/identities/ng';

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('KORAPAY_SECRET_KEY') || null;
  }

  verifyNin(
    nin: string,
    expected?: ExpectedIdentity,
  ): Promise<IdentityVerificationResult> {
    return this.verify('nin', nin, expected);
  }

  verifyBvn(
    bvn: string,
    expected?: ExpectedIdentity,
  ): Promise<IdentityVerificationResult> {
    return this.verify('bvn', bvn, expected);
  }

  private async verify(
    type: 'nin' | 'bvn',
    id: string,
    expected?: ExpectedIdentity,
  ): Promise<IdentityVerificationResult> {
    if (!this.secretKey) {
      throw new ServiceUnavailableException(
        'Identity verification is not configured. Set KORAPAY_SECRET_KEY.',
      );
    }

    const body: Record<string, unknown> = { id, verification_consent: true };
    if (expected?.firstName && expected?.lastName) {
      body.validation = {
        first_name: expected.firstName,
        last_name: expected.lastName,
      };
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${type}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(
        `${type.toUpperCase()} verification request failed: ${err.message}`,
      );
      throw new ServiceUnavailableException(
        'Could not reach the identity verification provider. Try again shortly.',
      );
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.status) {
      return {
        verified: false,
        reason: payload?.message || `${type.toUpperCase()} verification failed`,
      };
    }

    const data = payload.data ?? {};

    // If we asked Korapay to match against a name on file, honor the result.
    // A successful lookup with no validation block just confirms the ID exists.
    if (data.validation) {
      const firstNameOk = data.validation.first_name?.match !== false;
      const lastNameOk = data.validation.last_name?.match !== false;
      if (!firstNameOk || !lastNameOk) {
        return {
          verified: false,
          reason: `${type.toUpperCase()} holder's name does not match the name on your profile`,
          data,
        };
      }
    }

    return { verified: true, data };
  }
}
