import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { JwtStrategy } from './strategies/jwt.strategy';

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-change-me';

@Module({
  imports: [
    UsersModule,
    MailModule,
    ActivityLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          // eslint-disable-next-line no-console
          console.warn(
            '[auth] JWT_SECRET is not set. Falling back to an insecure ' +
              'development-only secret. Set JWT_SECRET in your .env file ' +
              '(see .env.example) before using this outside local dev.',
          );
        }
        return {
          secret: secret || DEV_FALLBACK_SECRET,
          signOptions: {
            expiresIn: configService.get<string>('JWT_EXPIRES_IN', '1d'),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
