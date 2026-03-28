import { Exo_2, Orbitron } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAMES } from "@/lib/auth/cookies";

import styles from "../lobby/lobby.module.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-lobby-display",
});

const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-lobby-body",
});

export default function RoomLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = cookies().get(AUTH_COOKIE_NAMES.accessToken)?.value;
  if (!token) {
    redirect("/login");
  }

  return (
    <div className={`${orbitron.variable} ${exo2.variable} ${styles.shell}`}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Vector <span>Racers</span>
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/">Hub</Link>
          <Link href="/lobby">Lobby</Link>
          <span className={styles.navCurrent} aria-current="page">
            Race room
          </span>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
