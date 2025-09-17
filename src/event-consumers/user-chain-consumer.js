// Status constants
const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

export default class UserChainConsumer {
    /**
     * @param {Object} dependencies - Destructured dependencies for proxy injection
     * @param {SlotGameData} dependencies.gameData
     * @param {mongoose.Model} dependencies.assignmentRepository
     * @param {logger} dependencies.logService
     */
    constructor({ gameData, assignmentRepository, logService }) {
        this.gameData = gameData;
        this.assignmentRepository = assignmentRepository;
        this.logService = logService;
    }

    /**
     * Load active player chain assignments from database and restore them to memory
     */
    async loadActiveChains() {
        try {
            const activeAssignments = await this.assignmentRepository
                .find({
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .lean()
                .exec();

            for (const assignment of activeAssignments) {
                const chain = this.gameData.availableChains?.find((c) => c.name === assignment.chainName);

                if (chain) {
                    const baseBetAmount = assignment.betLevel * assignment.coinValue;
                    const chainKey = `${assignment.playerName}-${baseBetAmount}`;
                    this.gameData.playerChains[chainKey] = {
                        name: assignment.chainName,
                        boards: [...chain.boards],
                        currentIndex: assignment.currentBoardIndex,
                        totalBoards: assignment.totalBoards,
                        assignedAt: assignment.assignedAt,
                        betLevel: assignment.betLevel,
                        coinValue: assignment.coinValue,
                        playerId: assignment.playerId,
                        playerName: assignment.playerName,
                    };
                }
            }
        } catch (error) {
            this.logService.logError(`Failed to load active chains:`, error);
        }
    }

    async assignChain(playerName, playerContext = {}) {
        const { betLevel, coinValue } = playerContext;

        const baseBetAmount = betLevel * coinValue;
        const chainKey = `${playerName}-${baseBetAmount}`;

        if (this.gameData.playerChains[chainKey]) {
            return false;
        }

        const applicableBoardCount = this.getApplicableBoardCount(playerContext, baseBetAmount);

        if (applicableBoardCount === -1) {
            return false;
        }

        const availableChains = this.gameData.availableChains || [];
        const matchingChains = availableChains.filter((chain) => {
            return chain.baseBetAmount === baseBetAmount && (chain.totalBoardCount || chain.boards?.length || 0) <= applicableBoardCount;
        });

        if (matchingChains.length === 0) {
            return false;
        }

        const randomIndex = Math.floor(Math.random() * matchingChains.length);
        const chain = matchingChains[randomIndex];

        this.gameData.playerChains[chainKey] = {
            name: chain.name,
            boards: [...chain.boards],
            currentIndex: 0,
            totalBoards: chain.boards.length,
            assignedAt: new Date(),
            betLevel,
            coinValue,
            playerId: playerContext.playerId,
            playerName,
        };

        try {
            const { playerId, operatorId, gameId, chainId, currency } = playerContext;

            const assignmentData = {
                playerId,
                playerName,
                chainName: chain.name,
                currentBoardIndex: 0,
                totalBoards: chain.boards.length,
                assignedAt: new Date(),
                lastActivityAt: new Date(),
                status: ASSIGNMENT_STATUS.ACTIVE,
                totalWinAmount: 0,
                totalBetAmount: 0,
                betLevel,
                coinValue,
                operatorId,
                gameId,
                chainId,
                currency,
            };

            await this.assignmentRepository.create(assignmentData);
        } catch (error) {
            const { playerId, operatorId, gameId, chainId, currency } = playerContext;
            this.logService.logError(`Failed to create chain assignment for ${playerName}: ${error.message}`);
        }

        return true;
    }

    /**
     * Update chain progress after a spin
     */
    async updateChainProgress({ playerId, playerName, betLevel, coinValue, roundBetAmount = 0, roundWinAmount = 0 }) {
        try {
            const baseBetAmount = betLevel * coinValue;
            const chainKey = `${playerName}-${baseBetAmount}`;
            const playerChain = this.gameData.playerChains[chainKey];
            if (!playerChain) {
                return null;
            }

            playerChain.currentIndex += 1;

            const setOptions = {
                lastActivityAt: new Date(),
            };
            if (playerChain.currentIndex >= playerChain.totalBoards) {
                setOptions.status = ASSIGNMENT_STATUS.COMPLETED;
                setOptions.completedAt = new Date();
                delete this.gameData.playerChains[chainKey];
            }

            const updatedAssignment = await this.assignmentRepository.findOneAndUpdate(
                {
                    playerId,
                    betLevel,
                    coinValue,
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                },
                {
                    $inc: {
                        currentBoardIndex: 1,
                        totalBetAmount: roundBetAmount,
                        totalWinAmount: roundWinAmount,
                    },
                    $set: {
                        ...setOptions,
                    },
                },
                {
                    new: true,
                }
            );

            if (!updatedAssignment) {
                return null;
            }

            return updatedAssignment;
        } catch (error) {
            this.logService.logError(`Failed to update chain progress for ${playerName}: ${error.message}`);

            return null;
        }
    }

    /**
     * Find chains that have been used with specific betLevel and coinValue
     */
    async findChainsByBet(betLevel, coinValue, status = ASSIGNMENT_STATUS.ACTIVE) {
        try {
            const statusFilter = Array.isArray(status) ? { $in: status } : status;

            const assignments = await this.assignmentRepository
                .find(
                    {
                        betLevel,
                        coinValue,
                        status: statusFilter,
                        gameId: this.gameData.gameConfigs.gameId,
                    },
                    { chainName: 1, _id: 0 }
                )
                .lean()
                .exec();

            return [...new Set(assignments.map((a) => a.chainName))];
        } catch (error) {
            this.logService.logError(`Failed to find chains by bet params: ${error.message}`);
            return [];
        }
    }

    /**
     * Calculate applicable board count using formula with betMultiplier from gameConfigs
     * @param {Object} playerContext - Player context with balance and bet information
     * @param {number} playerContext.balance - Player's current balance
     * @param {number} baseBetAmount - Base bet amount (betLevel * coinValue)
     * @returns {number} - Applicable board count from valid range [50, 75, 100, ..., 200] or -1 if invalid
     */
    getApplicableBoardCount(playerContext, baseBetAmount) {
        const { balance = 0 } = playerContext;

        if (baseBetAmount <= 0 || balance <= 0) {
            return -1;
        }

        const betMultiplier = this.gameData.gameConfigs?.cascadingSlotsConfig?.betMultiplier || 1;
        const affordableSpins = Math.floor(balance / baseBetAmount / betMultiplier);
        const calculatedBoardCount = Math.floor(affordableSpins + 0.25 * affordableSpins * betMultiplier);
        const assignedBoardCount = Math.max(calculatedBoardCount, 200);

        const validBoardCounts = [50, 75, 100, 125, 150, 175, 200];
        const closestBoardCount = validBoardCounts.reduce((closest, current) => {
            return Math.abs(current - assignedBoardCount) < Math.abs(closest - assignedBoardCount) ? current : closest;
        });

        return closestBoardCount;
    }
}
