export const keys = {
  challenge: (date: string) => `challenge:${date}`,
  challengeQueue: () => `challenge:queue`,
  drawing: (date: string, user: string) => `drawing:${date}:${user}`,
  drawingsList: (date: string) => `drawings:list:${date}`,
  vote: (date: string, target: string, voter: string) => `vote:${date}:${target}:${voter}`,
  streak: (user: string) => `streak:${user}`,
  usersAll: () => `users:all`,
};

export const today = (): string => new Date().toISOString().slice(0, 10);

export const yesterday = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
