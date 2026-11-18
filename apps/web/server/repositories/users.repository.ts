import type { Db } from '@devsync/database';

export const usersRepository = {
  findActiveById(db: Db, userId: string) {
    return db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, email: true, image: true, emailVerified: true },
    });
  },
};
