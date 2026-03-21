import 'dotenv/config';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from 'node_modules/@prisma/adapter-pg/dist/index.mjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

// Seed function to populate the database with initial data

async function main(): Promise<void> {
  try {
    // 1) Roles
    await prisma.role.createMany({
      data: [
        { id: 1, name: 'customer' },
        { id: 2, name: 'rider' },
        { id: 3, name: 'restaurant' },
        { id: 4, name: 'admin' },
      ],
      skipDuplicates: true,
    });

    // 2) Users (Linked to roles)
    const [customerA, customerB, restaurantOwnerA, adminUser] = await Promise.all([
      prisma.user.create({
        data: {
          firstName: 'Wanjiku',
          lastName: 'Mwangi',
          phoneNumber: '0712000001',
          roleId: 1,
        },
      }),
      prisma.user.create({
        data: {
          firstName: 'Kamau',
          lastName: 'Githinji',
          phoneNumber: '0712000002',
          roleId: 1,
        },
      }),
      prisma.user.create({
        data: {
          firstName: 'Muthoni',
          lastName: 'Njoroge',
          phoneNumber: '0712000003',
          roleId: 3,
        },
      }),
      prisma.user.create({
        data: {
          firstName: 'Peter',
          lastName: 'Karanja',
          phoneNumber: '0712000004',
          roleId: 4,
        },
      }),
    ]);

    // 3) Riders
    const [riderA, riderB] = await Promise.all([
      prisma.rider.create({
        data: {
          name: 'Nduta Gitahi',
          phoneNumber: '0712000011',
          status: 'online',
          address: 'Nyeri Town',
        },
      }),
      prisma.rider.create({
        data: {
          name: 'Mwangi Kariuki',
          phoneNumber: '0712000012',
          status: 'offline',
          address: 'Karatina, Nyeri',
        },
      }),
    ]);

    // 4) Restaurants
    const [restaurantA, restaurantB] = await Promise.all([
      prisma.restaurant.create({
        data: {
          name: 'Nyeri Nyama Choma',
          address: 'Ngara, Nyeri',
          phoneNumber: '0712000101',
          userId: restaurantOwnerA.id,
        },
      }),
      prisma.restaurant.create({
        data: {
          name: 'Mutura Express',
          address: 'Kamakwa, Nyeri',
          phoneNumber: '0712000102',
          userId: adminUser.id,
        },
      }),
    ]);

    // 5) Menu items
    const [menuItemsA, menuItemsB] = await Promise.all([
      prisma.menuItem.createMany({
        data: [
          { name: 'Nyama Choma', price: 500, restaurantId: restaurantA.id },
          { name: 'Irio', price: 200, restaurantId: restaurantA.id },
          { name: 'Sukumawiki', price: 150, restaurantId: restaurantA.id },
        ],
      }),
      prisma.menuItem.createMany({
        data: [
          { name: 'Mutura', price: 150, restaurantId: restaurantB.id },
          { name: 'Githeri', price: 100, restaurantId: restaurantB.id },
          { name: 'Mahindi Choma', price: 80, restaurantId: restaurantB.id },
        ],
      }),
    ]);

    // Fetch menu items for linking
    const [restaurantAMenu, restaurantBMenu] = await Promise.all([
      prisma.menuItem.findMany({ where: { restaurantId: restaurantA.id } }),
      prisma.menuItem.findMany({ where: { restaurantId: restaurantB.id } }),
    ]);

    // 6) Orders (link users, restaurants, and optionally riders)
    const orderA = await prisma.order.create({
      data: {
        status: 'pending',
        totalPrice: 850,
        userId: customerA.id,
        restaurantId: restaurantA.id,
        riderId: riderA.id,
      },
    });

    const orderB = await prisma.order.create({
      data: {
        status: 'delivered',
        totalPrice: 330,
        userId: customerB.id,
        restaurantId: restaurantB.id,
        riderId: null,
      },
    });

    // 7) Order items (linked to orders and menu items)
    await prisma.orderItem.createMany({
      data: [
        {
          orderId: orderA.id,
          menuItemId: restaurantAMenu[0].id,
          quantity: 1,
          price: restaurantAMenu[0].price,
        },
        {
          orderId: orderA.id,
          menuItemId: restaurantAMenu[1].id,
          quantity: 1,
          price: restaurantAMenu[1].price,
        },
        {
          orderId: orderB.id,
          menuItemId: restaurantBMenu[0].id,
          quantity: 1,
          price: restaurantBMenu[0].price,
        },
        {
          orderId: orderB.id,
          menuItemId: restaurantBMenu[1].id,
          quantity: 1,
          price: restaurantBMenu[1].price,
        },
      ],
    });

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();