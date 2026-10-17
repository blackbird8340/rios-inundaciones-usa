// Las fuentes de @fontsource se importan por subruta sin extensión (p. ej. ".../latin-700"),
// que el package mapea a un .css vía "exports". TypeScript no ve ese .css como módulo,
// así que lo declaramos acá para que `astro check` no marque un error falso.
declare module '@fontsource/big-shoulders-display/*';
