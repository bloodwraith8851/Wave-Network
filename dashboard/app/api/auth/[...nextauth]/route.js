import NextAuth from "next-auth"
import DiscordProvider from "next-auth/providers/discord"

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID || "dummy_client_id",
      clientSecret: process.env.DISCORD_CLIENT_SECRET || "dummy_secret",
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify+guilds",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "wave_network_secret_dev_key_12345",
  pages: {
    signIn: '/',
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
