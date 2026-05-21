import prisma from '../database';

export interface AccountWithFreeSpace {
  id: string;
  email: string;
  credentials: string;
  totalStorage: bigint;
  usedStorage: bigint;
  freeStorage: bigint;
}

/**
 * Storage strategy: selects the account with the most available free space
 * that can accommodate the given file size.
 */
export async function selectAccountForUpload(fileSize: bigint): Promise<AccountWithFreeSpace | null> {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
  });

  if (accounts.length === 0) {
    return null;
  }

  // Calculate free space for each account and sort by most free space
  const accountsWithFreeSpace: AccountWithFreeSpace[] = accounts
    .map((account) => ({
      id: account.id,
      email: account.email,
      credentials: account.credentials,
      totalStorage: account.totalStorage,
      usedStorage: account.usedStorage,
      freeStorage: account.totalStorage - account.usedStorage,
    }))
    .filter((account) => account.freeStorage >= fileSize)
    .sort((a, b) => {
      if (b.freeStorage > a.freeStorage) return 1;
      if (b.freeStorage < a.freeStorage) return -1;
      return 0;
    });

  if (accountsWithFreeSpace.length === 0) {
    return null;
  }

  // Return account with most free space
  return accountsWithFreeSpace[0];
}
