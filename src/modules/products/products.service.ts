import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Product, ProductCategory } from "@prisma-client";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { CreateProductDto } from "./dto/create-product.dto";
import { QueryProductsDto } from "./dto/query-products.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: DataAccessService) {}

  private async resolveCategoryId(
    categoryId?: string,
    categoryName?: string,
  ): Promise<string | null> {
    if (categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category with id ${categoryId} not found`);
      }
      return category.id;
    }

    if (!categoryName) {
      return null;
    }

    const normalizedName = categoryName.trim();
    const existing = await this.prisma.productCategory.findFirst({
      where: { name: { equals: normalizedName, mode: "insensitive" } },
    });
    if (existing) {
      return existing.id;
    }

    const created = await this.prisma.productCategory.create({
      data: {
        name: normalizedName,
      },
    });
    return created.id;
  }

  private buildWhere(query: QueryProductsDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { sku: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    return where;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const categoryId = await this.resolveCategoryId(
      dto.categoryId,
      dto.categoryName,
    );
    return this.prisma.product.create({
      data: {
        sku: dto.sku.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim(),
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice,
        stock: dto.stock ?? 0,
        taxPercent: dto.taxPercent ?? 0,
        unit: dto.unit.trim(),
        isActive: dto.isActive ?? true,
        categoryId,
      },
    });
  }

  async findAll(query: QueryProductsDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          category: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.findOne(id);
    const categoryId =
      dto.categoryId || dto.categoryName
        ? await this.resolveCategoryId(dto.categoryId, dto.categoryName)
        : undefined;

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice,
        stock: dto.stock,
        taxPercent: dto.taxPercent,
        unit: dto.unit?.trim(),
        isActive: dto.isActive,
        categoryId,
      },
    });
  }

  async remove(id: string): Promise<Product> {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  async listCategories(): Promise<ProductCategory[]> {
    return this.prisma.productCategory.findMany({
      orderBy: { name: "asc" },
    });
  }
}
