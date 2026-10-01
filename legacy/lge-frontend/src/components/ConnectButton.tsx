import { useLogin } from "@privy-io/react-auth";

export function ConnectButton() {
  const { login } = useLogin();

  return (
    <div className="connect-wallet">
      <button onClick={login} className="btn btn-accent">
        Connect Wallet
      </button>
    </div>
  );
}
