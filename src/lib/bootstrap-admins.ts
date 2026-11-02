// Pure helper for identifying bootstrap admins (Edge-runtime safe)
export function checkBootstrapAdmin(email: string): {
  isBootstrap: boolean;
  isTreasurer: boolean;
} {
  const normalized = email.trim().toLowerCase();
  const rawList =
    process.env.BOOTSTRAP_ADMIN_EMAILS ||
    'raileymiguelfrias@gmail.com,goyenashawn@gmail.com,christiansantiago0605@gmail.com';
  const bootstrapList = rawList
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isBootstrap = bootstrapList.some(
    (b) =>
      normalized === b ||
      (b.includes('@')
        ? normalized.startsWith(b.split('@')[0] + '@') ||
          normalized.startsWith(b.split('@')[0] + '_')
        : normalized.startsWith(b))
  );

  const isTreasurer = isBootstrap && (normalized.includes('railey') || normalized.includes('coo'));

  return { isBootstrap, isTreasurer };
}
