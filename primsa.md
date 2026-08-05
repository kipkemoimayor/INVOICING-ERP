# PRISMA DOCS

## Introduction

Prisma is an open-source database toolkit that simplifies database access and management. It provides a type-safe and intuitive API for working with databases, allowing developers to focus on building applications rather than dealing with complex database queries and migrations.

## Usage

To use Prisma, you need to follow these steps:

1. Install Prisma CLI: You can install the Prisma CLI globally using npm or yarn:

```bash
npm install -g prisma
```

```bash
yarn global add prisma
```

2. Initialize Prisma: Run the following command to initialize Prisma in your project:

```bash
prisma init
```

This will create a `prisma` directory with a `schema.prisma` file where you can define your database schema. 3. Define your schema: Open the `schema.prisma` file and define your database schema using Prisma's schema language. For example:

```prisma
model User {
  id    Int     @id @default(autoincrement())
  name  String
  email String  @unique
}
```

4. Generate Prisma Client: After defining your schema, run the following command to generate the Prisma Client:

```bash
prisma generate
```

This will create a `node_modules/@prisma/client` directory with the generated Prisma Client code. 5. Use Prisma Client: You can now use the Prisma Client in your application to interact with your database. For example:

```javascript
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const newUser = await prisma.user.create({
    data: {
      name: "Alice",
      email: "alice@yahoo.com",
    },
  });
  console.log();
}
main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## Running migrations

Prisma also provides a powerful migration system that allows you to manage your database schema changes over time. To create a new migration, run the following command:

```bash
prisma migrate dev --name <migration-name>
```

## Conclusion

Prisma is a powerful tool that simplifies database access and management, allowing developers to focus on building applications. With its type-safe API and intuitive schema language, Prisma makes it easier to work with databases and reduces the chances of errors. Whether you're building a small application or a large-scale project, Prisma can help you manage your database efficiently and effectively.
