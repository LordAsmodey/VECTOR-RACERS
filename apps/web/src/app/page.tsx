import React from "react";
import Link from "next/link";

import { VECTOR_RACERS_SHARED_VERSION } from "@vector-racers/shared";

import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.shell__header}>
          <Link href="/" className={styles.shell__brand} aria-label="Vector Racers">
            Vector <span>Racers</span>
          </Link>

          <nav className={styles.shell__nav} aria-label="Main navigation">
            <Link href="/" aria-current="page">
              Home
            </Link>
            <Link href="/login">Auth</Link>
            <Link href="/lobby">Lobby</Link>
          </nav>
        </header>

        <main className={styles.shell__main} id="main">
          <section className={styles.hero}>
            <div>
              <h1 className={styles.hero__title}>Vector Racers</h1>
              <p className={styles.hero__sub}>
                Neon racing, deterministic physics, and multiplayer turns that don’t drift.
              </p>
            </div>

            <div className={styles.hero__meta}>
              <div className={styles.metaChip}>
                @vector-racers/shared {VECTOR_RACERS_SHARED_VERSION}
              </div>
              <div className={styles.metaHint}>MVP landing · fast auth → lobby flow</div>
            </div>

            <div className={styles.ctaRow}>
              <Link href="/login" className={`${styles.btn} ${styles.btnPrimary}`}>
                Войти
              </Link>
              <Link href="/register" className={`${styles.btn} ${styles.btnSecondary}`}>
                Создать аккаунт
              </Link>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Что внутри</h2>

            <div className={styles.grid3}>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Deterministic physics</h3>
                <p className={styles.cardText}>
                  Одна и та же физика на клиенте и сервере: ходы считаются консистентно.
                </p>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Turn-based moves</h3>
                <p className={styles.cardText}>
                  Сервер принимает `submit_move`, присваивает `moveSeq` и синхронизирует состояние.
                </p>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Secure auth cookies</h3>
                <p className={styles.cardText}>
                  Access/refresh хранятся в `httpOnly` cookies — без токенов в storage.
                </p>
              </article>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Быстрые ссылки</h2>

            <ul className={styles.hubList}>
              <li>
                <Link href="/login" className={styles.hubList__link}>
                  <strong>Login</strong>
                  <div className={styles.hubList__meta}>RHF + Zod · Remember me</div>
                </Link>
              </li>
              <li>
                <Link href="/register" className={styles.hubList__link}>
                  <strong>Register</strong>
                  <div className={styles.hubList__meta}>Валидация · редирект в `/lobby`</div>
                </Link>
              </li>
              <li>
                <Link href="/lobby" className={styles.hubList__link}>
                  <strong>Lobby</strong>
                  <div className={styles.hubList__meta}>Создание/подключение комнат</div>
                </Link>
              </li>
            </ul>
          </section>
        </main>

        <footer className={styles.shell__footer}>
          Vector Racers — {new Date().getFullYear()} · Neon landing
        </footer>
      </div>
    </div>
  );
}
