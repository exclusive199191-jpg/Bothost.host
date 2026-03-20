import { useQuery } from "@tanstack/react-query";

export function useSession() {
  return useQuery<{ id: string }>({
    queryKey: ["/api/auth/init"],
    queryFn: async () => {
      const res = await fetch("/api/auth/init", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to initialize session");
      return res.json();
    },
    staleTime: Infinity,
    retry: 3,
  });
}
