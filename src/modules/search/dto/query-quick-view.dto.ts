import { IsIn, IsUUID } from "class-validator";

export class QueryQuickViewDto {
  @IsIn([
    "CUSTOMER",
    "PRODUCT",
    "QUOTATION",
    "PROFORMA",
    "INVOICE",
    "DELIVERY_NOTE",
    "PAYMENT",
  ])
  type:
    | "CUSTOMER"
    | "PRODUCT"
    | "QUOTATION"
    | "PROFORMA"
    | "INVOICE"
    | "DELIVERY_NOTE"
    | "PAYMENT";

  @IsUUID()
  id: string;
}
