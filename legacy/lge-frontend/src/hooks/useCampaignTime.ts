import { UseCampaignTimeParams } from "../types";

export function useCampaignTime({
  startBlock,
  currentBlock,
  campaignDuration,
}: UseCampaignTimeParams) {
  const calculateTimeProgress = () => {
    if (!startBlock || !currentBlock || !campaignDuration) return 0;

    const start = startBlock as bigint;
    const current = currentBlock;
    const endBlock = start + BigInt(campaignDuration);

    if (current >= endBlock) return 100;
    if (current < start) return 0;

    const elapsed = Number(current - start);
    const total = campaignDuration;

    return Math.min(Math.max((elapsed / total) * 100, 0), 100);
  };

  const getCountdown = () => {
    if (!startBlock || !currentBlock || !campaignDuration) {
      return {
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
      };
    }

    const start = startBlock as bigint;
    const current = currentBlock;
    const endBlock = start + BigInt(campaignDuration);

    if (current >= endBlock) {
      return {
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
      };
    }

    const blocksRemaining = Number(endBlock - current);
    const totalSeconds = blocksRemaining * 2;

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    return {
      days: days.toString().padStart(2, "0"),
      hours: hours.toString().padStart(2, "0"),
      minutes: minutes.toString().padStart(2, "0"),
      seconds: seconds.toString().padStart(2, "0"),
    };
  };

  const timeProgress = calculateTimeProgress();

  return {
    timeProgress,
    countdown: getCountdown(),
    isEnded: timeProgress >= 100,
    isStarted: timeProgress > 0,
  };
}
