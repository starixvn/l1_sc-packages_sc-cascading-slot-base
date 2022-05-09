export default class TotalMultiplierConsumer {
    /**
     * @param {SlotGameData} gameData
     * @param {mongoose.Model} totalMultiplierRepository
     * @param {EventConsumers.FreeSpinsConsumer} dependencies.freeSpinsConsumer
     */
    constructor(gameData, totalMultiplierRepository, freeSpinsConsumer) {
        this.gameData = gameData;
        this.totalMultiplierRepository = totalMultiplierRepository;
        this.freeSpinsConsumer = freeSpinsConsumer;
    }

    async increaseTotalMultiplier(player, { roundId, multiplier }) {
        if (!this.freeSpinsConsumer.hasFreeSpin(player)) {
            return;
        }

        const memberName = player.profile.name;
        const currentTotalMultiplier = this.gameData.ingame[memberName].totalMultiplier ?? 0;
        const newTotalMultiplier = currentTotalMultiplier + multiplier;

        const newRoundRecord = {
            time: new Date(),
            roundId,
            prevTotalMultiplier: currentTotalMultiplier,
            totalMultiplier: newTotalMultiplier,
            multiplier,
        };

        if (currentTotalMultiplier) {
            await this.totalMultiplierRepository.create({
                uid: player.UID,
                playerId: player.session?.memberId,
                name: player.profile.name,
                ended: false,
                time: new Date(),
                rounds: [newRoundRecord],
            });
        } else {
            await this.totalMultiplier.updateOne(
                { uid: player.UID, ended: false },
                {
                    $push: {
                        rounds: newRoundRecord,
                    },
                }
            );
        }

        this.gameData.ingame[memberName].totalMultiplier = newTotalMultiplier;
    }

    getCurrentMultiplier(player) {
        return this.gameData.ingame[player.profile.name].totalMultiplier ?? 0;
    }

    async stopChain(player) {
        await this.totalMultiplierRepository.updateOne({ uid: player.UID, ended: false }, { ended: true, endTime: new Date() });

        this.gameData.ingame[player.profile.name].totalMultiplier = 0;
    }

    async reload() {}
}
