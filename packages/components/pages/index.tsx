import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import Head from "next/head";
import { useContext } from "react";
import styles from "../styles/Home.module.css";
import { store } from "@popcorn/app/context/store";
import { setSingleActionModal } from "@popcorn/app/context/actions";

const Home: NextPage = () => {
  const { dispatch } = useContext(store);
  const openTestModal = () => {
    dispatch(
      setSingleActionModal({
        keepOpen: true,
        title: "Test Modal on Storybook",
        content: "The is a default storybook test to show our styles have been imported",
        onConfirm: { label: "Close Modal", onClick: () => dispatch(setSingleActionModal(false)) },
      }),
    );
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>RainbowKit App</title>
        <meta name="description" content="Generated by @rainbow-me/create-rainbowkit" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <ConnectButton />

        <h1 className={styles.title}>
          Welcome to <a href="">RainbowKit</a> + <a href="">wagmi</a> + <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className={styles.description}>
          Get started by editing <code className={styles.code}>pages/index.tsx</code>
        </p>

        <div className={styles.grid}>
          <a href="https://rainbowkit.com" className={styles.card}>
            <h2>RainbowKit Documentation &rarr;</h2>
            <p>Learn how to customize your wallet connection flow.</p>
          </a>

          <a href="https://wagmi.sh" className={styles.card}>
            <h2>wagmi Documentation &rarr;</h2>
            <p>Learn how to interact with Ethereum.</p>
          </a>

          <a href="https://github.com/rainbow-me/rainbowkit/tree/main/examples" className={styles.card}>
            <h2>RainbowKit Examples &rarr;</h2>
            <p>Discover boilerplate example RainbowKit projects.</p>
          </a>

          <a href="https://nextjs.org/docs" className={styles.card}>
            <h2>Next.js Documentation &rarr;</h2>
            <p>Find in-depth information about Next.js features and API.</p>
          </a>

          <a href="https://github.com/vercel/next.js/tree/canary/examples" className={styles.card}>
            <h2>Next.js Examples &rarr;</h2>
            <p>Discover and deploy boilerplate example Next.js projects.</p>
          </a>

          <a
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className={styles.card}
          >
            <h2>Deploy &rarr;</h2>
            <p>Instantly deploy your Next.js site to a public URL with Vercel.</p>
          </a>
        </div>
        <button className="bg-warmGray rounded-2xl font-medium text-black px-4 py-2" onClick={openTestModal}>
          Test Modal
        </button>
      </main>

      <footer className={styles.footer}>
        <a href="https://rainbow.me" target="_blank" rel="noopener noreferrer">
          Made with ❤️ by your frens at 🌈
        </a>
      </footer>
    </div>
  );
};

export default Home;
