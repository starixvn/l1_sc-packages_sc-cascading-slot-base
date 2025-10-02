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
        this.gamePromotionApiClient = gamePromotionApiClient;
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
            const players = Object.values(this.gameData.realPlayers);

            if (isRestart) {
                const playersWithPromotion = totalMultipliers.filter((totalMultiplier) => totalMultiplier.promotionId).map((totalMultiplier) => {
                    return {
                        playerId: totalMultiplier.playerId,
                        promotion: totalMultiplier.promotionId,
                    };
                });

                const promotionPromotions = await this.gamePromotionApiClient.queryPlayersIncompletePromotions({
                    playerPromotionPairs: playersWithPromotion
                });

                Object.values(this.gameData.ingame).forEach((ingame) => {
                    const promotion = promotionPromotions.find((p) => p.playerId === ingame.playerId)?.promotion;
                    if (promotion) {
                        ingame.promotion = promotion;
                    }
                });
            }

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

    isPlayerHavingPromotionFreeSpins(player, totalMultiplier) {
        const playerIds = [
            "10000026~26_0_C_0_13454870",
            "10000026~26_0_C_455_5172263",
            "10000026~26_0_C_946_212612",
            "10000026~26_0_C_455_12410331",
            "10000026~26_0_C_455_8864169",
            "10000026~26_0_C_455_12376715",
            "10000026~26_0_C_455_13112526",
            "10000026~26_0_C_0_1890380",
            "10000026~26_0_C_0_909241",
            "10000026~26_0_C_455_12171110",
            "10000026~26_0_C_0_6391909",
            "10000026~26_0_C_946_215468",
            "10000026~26_0_C_946_215408",
            "10000026~26_0_C_0_3979015",
            "43180878",
            "67551702",
            "10000026~26_0_C_455_13036480",
            "113063926",
            "10000026~26_0_C_0_8123569",
        ];

        if (!totalMultiplier.promotionId) {
            return false;
        }

        if (totalMultiplier.promotionId && (!player?.promotion || !this.gameData.ingame[totalMultiplier.name]?.promotion)) {
            return playerIds.includes(totalMultiplier.playerId);
        }

        return player?.promotion?.remainingBonusItems > 0 || this.gameData.ingame[totalMultiplier.name]?.promotion?.remainingBonusItems > 0;
    }
}
