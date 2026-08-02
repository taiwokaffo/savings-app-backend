import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PaystackService } from './paystack.service';
import { PaymentsService } from './payments.service';

@Controller('webhooks/paystack')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    if (
      !req.rawBody ||
      !this.paystackService.verifyWebhookSignature(req.rawBody, signature)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = req.body as { event?: string; data?: { reference?: string } };

    if (event?.event === 'charge.success' && event.data?.reference) {
      // Never let a downstream failure make Paystack think delivery
      // failed (which would trigger retries) — log and move on.
      try {
        await this.paymentsService.handleWebhookReference(
          event.data.reference,
        );
      } catch (err) {
        this.logger.error(
          `Failed to process webhook for ${event.data.reference}: ${err.message}`,
        );
      }
    }

    // Always acknowledge quickly so Paystack doesn't retry unnecessarily.
    return { received: true };
  }
}
