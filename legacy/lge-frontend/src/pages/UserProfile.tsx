import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useUserTokens, useCampaignActions, useChainConfig } from "../hooks";
import { TokenData } from "../types";

export function UserProfile() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { userData, userTokens, loading } = useUserTokens(address);
  const { claimLiquidity, withdraw } = useCampaignActions();
  const currencySymbol = useChainConfig()?.currencySymbol ?? "ETH";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatTokenAmount = (amount: bigint) => {
    return (Number(amount) / 1e18).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  };

  const renderActionButton = (token: TokenData) => {
    if (token.hasClaimed) {
      if (token.remainingEthDeposited > 0n) {
        return (
          <button
            className="action-btn recover-btn"
            onClick={() => withdraw(token.hookAddress)}
          >
            [RECOVER {currencySymbol}]
          </button>
        );
      }
      return <span className="status-complete">[COMPLETE]</span>;
    }

    if (token.isLgeFinished && !token.isLgeSuccessful) {
      return (
        <button
          className="action-btn recover-btn"
          onClick={() => withdraw(token.hookAddress)}
        >
          [RECOVER {currencySymbol}]
        </button>
      );
    }

    return (
      <button
        className="action-btn claim-btn"
        onClick={() => claimLiquidity(token.hookAddress)}
        disabled={!token.isLgeSuccessful}
      >
        [CLAIM LP]
      </button>
    );
  };

  if (!authenticated) {
    return (
      <div className="user-profile-page">
        <div className="connect-prompt">
          <h1>Profile</h1>
          <p>Please connect your wallet to view your profile</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-profile-page">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      <div className="profile-header">
        <h1>My Tokens</h1>
      </div>

      <div className="profile-info">
        <div className="info-card">
          <h2>Wallet Address</h2>
          <code>{address}</code>
        </div>

        {userData && (
          <div className="info-card">
            <h2>First Connected</h2>
            <p>{new Date(userData.createdAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      <div className="tokens-table-section">
        {userTokens.length === 0 ? (
          <div className="empty-state">
            <p>You haven't purchased any tokens yet.</p>
            <Link to="/" className="btn btn-primary">
              Browse Campaigns
            </Link>
          </div>
        ) : (
          <div className="tokens-table-container">
            <table className="tokens-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Token Name</th>
                  <th>Ticker</th>
                  <th>Token Address</th>
                  <th>Tokens</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {userTokens.map((token) => (
                  <tr key={token.id}>
                    <td className="image-cell">
                      {token.tokenImageUrl ? (
                        <img
                          src={token.tokenImageUrl}
                          alt={token.tokenName}
                          className="token-thumbnail"
                        />
                      ) : (
                        <div className="token-placeholder">
                          <span className="token-symbol">
                            {token.tokenSymbol}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>{token.tokenName}</td>
                    <td className="ticker">{token.tokenSymbol}</td>
                    <td className="address-cell">
                      <span>
                        {token.tokenAddress.slice(0, 6)}...
                        {token.tokenAddress.slice(-4)}
                      </span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(token.tokenAddress)}
                      >
                        [COPY]
                      </button>
                    </td>
                    <td className="tokens-amount">
                      {formatTokenAmount(token.tokensToLiquidity)}
                    </td>
                    <td className="action-cell">{renderActionButton(token)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
