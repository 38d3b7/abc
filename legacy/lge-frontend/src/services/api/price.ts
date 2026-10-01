async function getETHPrice(): Promise<number | null> {
  try {
    const response = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'
    );
    const data = await response.json();
    return parseFloat(data.price); // Returns like "2500.50"
  } catch (error) {
    console.error('Failed to fetch ETH price:', error);
    return null;
  }
}

export { getETHPrice };
