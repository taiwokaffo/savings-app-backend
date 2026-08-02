/**
 * Promotes a user to ADMIN by email. Run this once to bootstrap your first
 * admin account (there's deliberately no public API endpoint that can turn
 * a regular user into an admin).
 *
 * Usage:
 *   npm run promote:admin -- someone@example.com
 */
import AppDataSource from '../src/config/typeorm.config';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/common/enums/user.enums';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run promote:admin -- <email>');
    process.exit(1);
  }

  await AppDataSource.initialize();
  const usersRepository = AppDataSource.getRepository(User);

  const user = await usersRepository.findOne({ where: { email } });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    await AppDataSource.destroy();
    process.exit(1);
  }

  if (user.role === UserRole.ADMIN) {
    console.log(`"${email}" is already an ADMIN.`);
  } else {
    user.role = UserRole.ADMIN;
    await usersRepository.save(user);
    console.log(`"${email}" has been promoted to ADMIN.`);
  }

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error('Failed to promote user:', err);
  await AppDataSource.destroy().catch(() => undefined);
  process.exit(1);
});
