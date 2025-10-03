import FreeSpinsConsumer from "./free-spins-consumer";
export default class TotalMultiplierConsumer {
    /**
     * @param {SlotGameData} gameData
     * @param {mongoose.Model} totalMultiplierRepository
     * @param {FreeSpinsConsumer} freeSpinsConsumer
     * @param {Object} gamePromotionApiClient
     */
    constructor(gameData, totalMultiplierRepository, freeSpinsConsumer, gamePromotionApiClient) {
        this.gameData = gameData;
        this.totalMultiplierRepository = totalMultiplierRepository;
        this.freeSpinsConsumer = freeSpinsConsumer;
        this.gamePromotionApiClient = gamePromotionApiClient.instance();
    }

    async increaseTotalMultiplier(player, { roundId, multiplier }) {
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
            await this.totalMultiplierRepository.updateOne(
                { uid: player.UID, ended: false },
                {
                    $push: {
                        rounds: newRoundRecord,
                    },
                }
            );
        } else {
            await this.totalMultiplierRepository.create({
                uid: player.UID,
                playerId: player.session?.playerId,
                name: player.profile.name,
                ended: false,
                time: new Date(),
                rounds: [newRoundRecord],
                ...(player.usePromotion && { promotionId: player.promotion.promotionId }),
            });
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

    async reload(isRestart = false) {
        const totalMultipliers = await this.totalMultiplierRepository.find({ ended: false }).lean().exec();

        if (totalMultipliers.length > 0) {
            if (isRestart) {
                await this.reloadPromotionsForRestart(totalMultipliers);
            }

            const players = Object.values(this.gameData.realPlayers);

            totalMultipliers.forEach(async (totalMultiplier) => {
                var player = players.find((player) => player.UID === totalMultiplier.uid);

                const latestTotalMultiplier = totalMultiplier.rounds[totalMultiplier.rounds.length - 1].totalMultiplier;

                const isHavingFreeSpins =
                    this.freeSpinsConsumer.hasFreeSpin({ profile: { name: totalMultiplier.name } }) ||
                    this.isPlayerHavingPromotionFreeSpins(player, totalMultiplier);

                if (isHavingFreeSpins) {
                    this.gameData.ingame[totalMultiplier.name] = this.gameData.ingame[totalMultiplier.name] ?? { betQueue: [] };
                    this.gameData.ingame[totalMultiplier.name].totalMultiplier = latestTotalMultiplier;
                } else {
                    this.gameData.ingame[totalMultiplier.name] && (this.gameData.ingame[totalMultiplier.name].totalMultiplier = 0);
                    await this.totalMultiplierRepository.updateOne({ uid: totalMultiplier.uid, ended: false }, { ended: true, endTime: new Date() });
                }
            });
        }
    }

    async reloadPromotionsForRestart(totalMultipliers) {
        const promotionQueryPairs = totalMultipliers
            .filter((totalMultiplier) => totalMultiplier.promotionId)
            .map((totalMultiplier) => {
                return {
                    playerId: totalMultiplier.playerId,
                    promotionId: totalMultiplier.promotionId,
                };
            });

        if (promotionQueryPairs.length === 0) {
            return;
        }

        const activePlayerPromotions = await this.gamePromotionApiClient.queryPlayersIncompletePromotions({
            playerPromotionPairs: promotionQueryPairs,
        });

        if (!activePlayerPromotions || activePlayerPromotions.length === 0) {
            return;
        }

        activePlayerPromotions.forEach((playerPromotionData) => {
            const totalMultiplier = totalMultipliers.find((multiplier) => multiplier.playerId === playerPromotionData.playerId);

            if (totalMultiplier) {
                this.gameData.ingame[totalMultiplier.name] = this.gameData.ingame[totalMultiplier.name] ?? { betQueue: [] };
                this.gameData.ingame[totalMultiplier.name].promotion = playerPromotionData.promotion;
            }
        });
    }

    isPlayerHavingPromotionFreeSpins(player, totalMultiplier) {
        if (!totalMultiplier.promotionId) {
            return false;
        }

        return player?.promotion?.remainingBonusItems > 0 || this.gameData.ingame[totalMultiplier.name]?.promotion?.remainingBonusItems > 0;
    }
}
