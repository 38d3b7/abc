import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useUserLaunches } from "../hooks";

export function UserLaunches() {
  const { authenticated, user } = usePrivy();
  const address = user?.wallet?.address;
  const { userData, launchedTokens, loading } = useUserLaunches(address);

  if (!authenticated) {
    return (
      <div className="user-profile-page">
        <div className="connect-prompt">
          <h1>My Launches</h1>
          <p>Please connect your wallet to view your launches</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-profile-page">
        <div className="loading">Loading launches...</div>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      <div className="profile-header">
        <h1>My Launches</h1>
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
        {launchedTokens.length === 0 ? (
          <div className="empty-state">
            <p>You haven't launched any tokens yet.</p>
            <Link to="/" className="btn btn-primary">Launch Campaign</Link>
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
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {launchedTokens.map((token) => (
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
                          <span className="token-symbol">{token.tokenSymbol}</span>
                        </div>
                      )}
                    </td>
                    <td>{token.tokenName}</td>
                    <td className="ticker">{token.tokenSymbol}</td>
                    <td className="address-cell">
                      <span>{token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}</span>
                      <button 
                        className="copy-btn"
                        onClick={() => navigator.clipboard.writeText(token.tokenAddress)}
                      >
                        [COPY]
                      </button>
                    </td>
                    <td className="created-date">
                      {new Date(token.createdAt).toLocaleDateString()}
                    </td>
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
