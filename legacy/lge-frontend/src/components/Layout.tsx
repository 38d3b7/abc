import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSwitchChain } from "wagmi";
import { arcTestnet } from "../config/chains";
import { useEffect, useState, useRef } from "react";
import { ConnectButton } from "./ConnectButton";
import { getUser, createUser } from "../services/api/user";
import { Logo } from "./Logo";
import { CreateCampaign } from "./CreateCampaign";

export function Layout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const address = user?.wallet?.address;
  const [isAddressExpanded, setIsAddressExpanded] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoSize, setLogoSize] = useState(84);
  const hasCreatedUser = useRef(false);

  useEffect(() => {
    const updateLogoSize = () => {
      setLogoSize(window.innerWidth < 600 ? 64 : 84);
    };
    updateLogoSize();
    window.addEventListener("resize", updateLogoSize);
    return () => window.removeEventListener("resize", updateLogoSize);
  }, []);

  useEffect(() => {
    if (authenticated && chain && chain.id !== arcTestnet.id) {
      switchChain({ chainId: arcTestnet.id });
    }
  }, [authenticated, chain, switchChain]);

  useEffect(() => {
    if (!authenticated) {
      hasCreatedUser.current = false;
      return;
    }

    if (!address || hasCreatedUser.current) {
      return;
    }

    const handleUserCreation = async () => {
      hasCreatedUser.current = true;

      try {
        await getUser(address);
      } catch (error) {
        try {
          await createUser(address);
        } catch (createError) {
          console.error("Error creating user:", createError);
          hasCreatedUser.current = false;
        }
      }
    };

    handleUserCreation();
  }, [authenticated, address]);

  const handleCampaignCreated = () => {
    setShowCreateForm(false);
    window.location.reload();
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand">
            <Link
              to="/"
              className="brand-link"
              onClick={() => setShowCreateForm(false)}
            >
              <Logo size={logoSize} />
            </Link>
            <div className="testnet-badge">
              <img
                src="/assets/images/uniswap-uni-logo.png"
                alt="Unichain Logo"
                className="unichain-logo"
                width={20}
                height={20}
              />
              <span className="testnet-badge-text">TESTNET</span>
            </div>
          </div>

          <div className="nav-links desktop-only">
            {authenticated && (
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="btn btn-primary"
              >
                {showCreateForm ? "Cancel" : "+ Launch"}
              </button>
            )}
          </div>

          <div className="nav-actions">
            <Link
              to="/about"
              className="info-btn desktop-only"
              onClick={() => setShowCreateForm(false)}
            >
              <span className="info-icon">[i]</span>
            </Link>
            {!ready ? (
              <div className="loading">Loading...</div>
            ) : authenticated ? (
              <div className="connected-info desktop-only">
                <div className="address-dropdown">
                  <button
                    className="address"
                    onClick={() => setIsAddressExpanded(!isAddressExpanded)}
                  >
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </button>
                  {isAddressExpanded && (
                    <div className="address-dropdown-menu">
                      <Link
                        to="/profile"
                        className="dropdown-item dropdown-button"
                        onClick={() => setIsAddressExpanded(false)}
                      >
                        <span className="dropdown-icon">[T]</span> My Tokens
                      </Link>
                      <Link
                        to="/launches"
                        className="dropdown-item dropdown-button"
                        onClick={() => setIsAddressExpanded(false)}
                      >
                        <span className="dropdown-icon">[L]</span> My Launches
                      </Link>
                      <button
                        onClick={() => {
                          logout();
                          setIsAddressExpanded(false);
                        }}
                        className="dropdown-item dropdown-button disconnect"
                      >
                        <span className="dropdown-icon">[X]</span> Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="desktop-only">
                <ConnectButton />
              </div>
            )}

            <button
              className="mobile-menu-toggle mobile-only"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`hamburger ${isMobileMenuOpen ? "open" : ""}`}>
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="mobile-menu">
            <div className="mobile-menu-content">
              <Link
                to="/about"
                className="mobile-menu-item"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowCreateForm(false);
                }}
              >
                <span className="menu-icon">[i]</span> About
              </Link>

              {authenticated ? (
                <>
                  <button
                    onClick={() => {
                      setShowCreateForm(!showCreateForm);
                      setIsMobileMenuOpen(false);
                    }}
                    className="mobile-menu-item mobile-menu-button"
                  >
                    <span className="menu-icon">[+]</span>{" "}
                    {showCreateForm ? "Cancel Launch" : "Launch Token"}
                  </button>

                  <Link
                    to="/profile"
                    className="mobile-menu-item"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setShowCreateForm(false);
                    }}
                  >
                    <span className="menu-icon">[T]</span> My Tokens
                  </Link>

                  <Link
                    to="/launches"
                    className="mobile-menu-item"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setShowCreateForm(false);
                    }}
                  >
                    <span className="menu-icon">[L]</span> My Launches
                  </Link>

                  <div className="mobile-menu-address">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </div>

                  <button
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="mobile-menu-item mobile-menu-button disconnect"
                  >
                    <span className="menu-icon">[X]</span> Disconnect
                  </button>
                </>
              ) : (
                <div className="mobile-menu-connect">
                  <ConnectButton />
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="main-content">
        {showCreateForm ? (
          <CreateCampaign onSuccess={handleCampaignCreated} />
        ) : (
          children
        )}
      </main>
      <footer className="footer">
        <p>
          Everything is permissionless • Uniswap v4 hook incubator prize winner
          • Pink chain launchpad
        </p>
      </footer>
    </div>
  );
}
