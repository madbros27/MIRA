/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname
  } catch {
    return null
  }
})()

const nextConfig = {
  reactStrictMode: true,
  // Republish the two server-named settings the browser also needs, so the
  // documented .env names stay exactly as the README describes them.
  env: {
    NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP: process.env.ALLOW_PUBLIC_SIGNUP ?? 'false',
  },
  images: {
    remotePatterns: [
      // Supabase Storage (avatars, attachments) for the configured project.
      ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : []),
      // Google / GitHub OAuth avatars.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },
}

export default nextConfig
