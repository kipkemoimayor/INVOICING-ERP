import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  private getSmtpConfig() {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = Number(this.configService.get<string>("SMTP_PORT") ?? "587");
    const secure =
      String(this.configService.get<string>("SMTP_SECURE") ?? "false") ===
      "true";
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const fromAddress = this.configService.get<string>("SMTP_FROM");
    const fromName =
      this.configService.get<string>("SMTP_FROM_NAME") ?? "Sales ERP";

    if (!host || !user || !pass || !fromAddress) {
      throw new BadRequestException(
        "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.",
      );
    }

    return { host, port, secure, user, pass, fromAddress, fromName };
  }

  async sendMail(input: SendMailInput) {
    const smtp = this.getSmtpConfig();
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });
  }
}
