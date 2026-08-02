import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true keeps the raw request buffer available (req.rawBody)
  // alongside the normally-parsed req.body — needed to verify the
  // Paystack webhook's HMAC signature. See payments/paystack-webhook.controller.ts
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Ensures @Exclude() fields (like password) never leak in responses
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Savings app backend running on http://localhost:${port}/api`);
}
bootstrap();
