const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

const CHAIN_CONSTANTS = {
    MINIMUM_PLAYABLE_BOARDS: 50,
    APPLICABLE_BOARDS_MULTIPLIER: 0.25,
    VALID_BOARD_COUNTS: [50, 75, 100, 125, 150, 175, 200],
};

export default class UserChainConsumer {
    constructor({ gameData, assignmentRepository, logService, resultChainManager }) {
        this.gameData = gameData;
        this.assignmentRepository = assignmentRepository;
        this.logService = logService;
        this.chainManager = resultChainManager;
    }

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
                        boards: null,
                        currentIndex: assignment.currentBoardIndex,
                        totalBoards: assignment.totalBoards,
                        assignedAt: assignment.assignedAt,
                        betLevel: assignment.betLevel,
                        coinValue: assignment.coinValue,
                        playerId: assignment.playerId,
                        playerName: assignment.playerName,
                        boardsLoaded: false,
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

        const existingChain = this.gameData.playerChains[chainKey];
        if (existingChain) {
            if (!existingChain.boardsLoaded) {
                const boards = await this.chainManager.getBoardsByChainName(existingChain.name);
                if (boards) {
                    existingChain.boards = [...boards];
                    existingChain.boardsLoaded = true;
                }
            }
            return false;
        }

        const applicableBoardCount = this.getApplicableBoardCount(playerContext, baseBetAmount);

        if (applicableBoardCount === -1) {
            return false;
        }

        const availableChains = this.gameData.availableChains || [];

        const matchingChains = availableChains.filter((chain) => {
            return chain.totalBoardCount <= applicableBoardCount;
        });

        if (matchingChains.length === 0) {
            return false;
        }

        const randomIndex = Math.floor(Math.random() * matchingChains.length);
        const selectedChain = matchingChains[randomIndex];

        const boards = await this.chainManager.getBoardsByChainName(selectedChain.name);
        if (!boards) {
            return false;
        }

        this.gameData.playerChains[chainKey] = {
            name: selectedChain.name,
            boards: [...boards],
            currentIndex: 0,
            totalBoards: boards.length,
            assignedAt: new Date(),
            betLevel,
            coinValue,
            playerId: playerContext.playerId,
            playerName,
            boardsLoaded: true,
        };

        try {
            const { playerId, operatorId, gameId, chainId, currency } = playerContext;

            const assignmentData = {
                playerId,
                playerName,
                chainName: selectedChain.name,
                currentBoardIndex: 0,
                totalBoards: boards.length,
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

    getPlayableBoards(balance, baseBetAmount, betMultiplier) {
        if (baseBetAmount <= 0 || balance <= 0) {
            return -1;
        }

        return Math.floor(balance / baseBetAmount / betMultiplier);
    }

    getApplicableBoards(playableBoards) {
        if (playableBoards < CHAIN_CONSTANTS.MINIMUM_PLAYABLE_BOARDS) {
            return -1;
        }

        return Math.floor(playableBoards + CHAIN_CONSTANTS.APPLICABLE_BOARDS_MULTIPLIER * playableBoards);
    }

    getClosestValidBoardCount(applicableBoards) {
        return CHAIN_CONSTANTS.VALID_BOARD_COUNTS.reduce((closest, current) => {
            return Math.abs(current - applicableBoards) < Math.abs(closest - applicableBoards) ? current : closest;
        });
    }

    getApplicableBoardCount(playerContext, baseBetAmount) {
        const { balance = 0 } = playerContext;

        if (balance === 0) {
            return -1;
        }

        const betMultiplier = this.gameData.gameConfigs?.cascadingSlotsConfig?.betMultiplier || 1;

        const playableBoards = this.getPlayableBoards(balance, baseBetAmount, betMultiplier);
        if (playableBoards === -1) {
            return -1;
        }

        const applicableBoards = this.getApplicableBoards(playableBoards);
        if (applicableBoards === -1) {
            return -1;
        }

        return this.getClosestValidBoardCount(applicableBoards);
    }
}
