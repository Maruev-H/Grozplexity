import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe());
  
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Backend server running on http://localhost:${port}`);
}
bootstrap();
