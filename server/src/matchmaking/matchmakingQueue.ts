export function createMatchmakingQueue() {
  const waitingSocketIds: string[] = [];

  return {
    enqueue(socketId: string): string | null {
      if (waitingSocketIds.includes(socketId)) {
        return null;
      }

      const opponentSocketId = waitingSocketIds.shift();

      if (!opponentSocketId) {
        waitingSocketIds.push(socketId);
        return null;
      }

      return opponentSocketId;
    },

    remove(socketId: string) {
      const index = waitingSocketIds.indexOf(socketId);

      if (index >= 0) {
        waitingSocketIds.splice(index, 1);
      }
    },
  };
}
