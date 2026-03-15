import { useQuery } from "@tanstack/react-query";

interface SessionUser {
  id: number;
}

export function useSession() {
  return useQuery<SessionUser>({
    queryKey: ["/api/auth/init"],
    queryFn: async () => {
      const res = await fetch("/api/auth/init");
      if (!res.ok) throw new Error("Session init failed");
      return res.json();
    },
    retry: 2,
    staleTime: 1000 * 60 * 10,
  });
}

// Keep useAuth as alias so BotDetail / other pages still compile
export { useSession as useAuth };
