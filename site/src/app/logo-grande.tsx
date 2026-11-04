import Image from 'next/image';

/** Logo das telas que não têm banner: entrada, verificação, conta suspensa e conta banida. */
export function LogoGrande() {
  return <Image className="logo-grande" src="/marca/logo.webp" alt="Magnatas do CS" width={1000} height={334} priority />;
}
