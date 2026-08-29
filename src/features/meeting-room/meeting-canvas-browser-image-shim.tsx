import type { ImgHTMLAttributes } from 'react';

type BrowserFixtureImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  unoptimized?: boolean;
};

export default function BrowserFixtureImage({
  unoptimized: _unoptimized,
  ...props
}: BrowserFixtureImageProps) {
  void _unoptimized;
  // The production component uses next/image; Vite only needs its browser-native equivalent.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} />;
}
