import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { ORIGINS } from "./config/default";

async function bootstrap() {
  const PREFIX = "api";
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>("PORT") || 3000;

  // Enable CORS for frontend
  app.enableCors({
    origin: ORIGINS,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    allowedHeaders:
      "Content-Type, Accept, Authorization, ngrok-skip-browser-warning",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(PREFIX);

  await app.listen(PORT);

  const url = await app.getUrl();
  console.log(`Server is running on ${url}`);
  console.log(`Application is running on PORT: ${PORT}`);
}
void bootstrap();
