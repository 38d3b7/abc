import { useChainConfig } from "../hooks";

export function About() {
  const currencySymbol = useChainConfig()?.currencySymbol ?? "ETH";

  return (
    <div className="about-page">
      <div className="about-header">
        <h1>About LGE</h1>
        <p className="about-subtitle">
          Permissionless Token Launchpad on Arc
        </p>
      </div>

      <div className="about-content">
        {/* Full Width Boxes */}
        <div className="about-section full-width">
          <div className="about-box">
            <h2 className="box-header">
              How to get testnet USDC on Arc Testnet
            </h2>
            <p className="box-text">
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="about-link"
              >
                https://faucet.circle.com
              </a>
            </p>
          </div>
        </div>

        <div className="about-section full-width">
          <div className="about-box">
            <h2 className="box-header">
              How to add Arc Testnet to your wallet
            </h2>
            <p className="box-text">
              <strong>Network name:</strong> Arc Testnet
              <br />
              <strong>Chain ID:</strong> 5042002
              <br />
              <strong>RPC URL:</strong> https://rpc.testnet.arc.io
              <br />
              <strong>Currency symbol:</strong> USDC
              <br />
              <strong>Block explorer:</strong>{" "}
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noopener noreferrer"
                className="about-link"
              >
                https://testnet.arcscan.app
              </a>
            </p>
          </div>
        </div>

        {/* Half Width Boxes */}
        <div className="about-grid">
          <div className="about-section half-width">
            <div className="about-box">
              <h2 className="box-header">How it works</h2>
              <p className="box-text">
                The token rate starts low and rises over time - early buyers
                get fewer tokens per {currencySymbol}, while later buyers get
                more tokens per {currencySymbol}. If the LGE does not sell 100%
                of tokens, all participants recover all of their{" "}
                {currencySymbol} but if the LGE was a success (100% of tokens
                were sold) a liquidity position is created and participants own
                a share of this liquidity in proportion to the share of the
                token supply they acquired. Participants can claim their LP
                anytime.
              </p>
            </div>
          </div>

          <div className="about-section half-width">
            <div className="about-box">
              <h2 className="box-header">Recommended wallets</h2>
              <p className="box-text">
                <strong>Uniwallet:</strong>{" "}
                <a
                  href="https://docs.unichain.org/docs/getting-started/setting-up-a-wallet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="about-link"
                >
                  https://docs.unichain.org/docs/getting-started/setting-up-a-wallet
                </a>
              </p>
            </div>
          </div>

          <div className="about-section half-width">
            <div className="about-box">
              <h2 className="box-header">Tokenomics</h2>
              <p className="box-text">
                40% team (vesting over 3 years with a 6 month cliff)
                <br />
                40% community (airdrops and influencers)
                <br />
                20% partners (investors, exchanges etc.)
              </p>
            </div>
          </div>

          <div className="about-section half-width">
            <div className="about-box">
              <h2 className="box-header">Airdrop</h2>
              <p className="box-text">
                <strong>Campaign 1: 20%</strong>
                <br />
                15% early users
                <br />
                Buyers & Launchers
                <br />
                5% to influencers (allocated transparently)
                <br />
                <br />
                <strong>Campaign 2: 20%</strong>
                <br />
                TBA
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
