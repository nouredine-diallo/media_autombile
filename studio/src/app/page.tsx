import Link from "next/link";
import { logout } from "@/app/actions/auth";

export default async function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200/70 bg-white/75 px-6 py-4 backdrop-blur-xl">
        <h1 className="text-lg font-semibold text-zinc-900">
          STUDIO AUTOMOBILE
        </h1>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
          >
            Déconnexion
          </button>
        </form>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-zinc-500">
            Transformez 1 à 3 images + un texte en un post automobile prêt à publier.
          </p>
          <Link
            href="/nouveau-post"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Créer un post
          </Link>
        </div>
      </main>
    </div>
  );
}
