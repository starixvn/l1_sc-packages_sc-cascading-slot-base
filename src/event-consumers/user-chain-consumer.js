const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

const CHAIN_CONSTANTS = {
    MINIMUM_PLAYABLE_BOARDS: 50,
    MAXIMUM_APPLICABLE_BOARDS: 100, // Maximum board count for chain assignment
    APPLICABLE_BOARDS_MULTIPLIER: 0.25,
    VALID_BOARD_COUNTS: [50, 75, 100, 125, 150, 175, 200],
    // Memory expiration settings
    MEMORY_EXPIRATION_MINUTES: 30, // Remove from memory after 30 minutes of inactivity
    // Global cache settings
    MAX_GLOBAL_CACHE_SIZE: 300, // Maximum number of cached player chains across all players
};

export default class UserChainConsumer {
    constructor({ gameData, assignmentRepository, logService, resultChainManager }) {
        this.gameData = gameData;
        this.assignmentRepository = assignmentRepository;
        this.logService = logService;
        this.chainManager = resultChainManager;
    }

    /**
     * Calculate normalized base bet amount with floating point precision fix
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {number} Normalized base bet amount
     */
    calculateBaseBetAmount(betLevel, coinValue) {
        return Math.round(betLevel * coinValue * 100) / 100;
    }

    /**
     * Generate consistent chain key from player name and bet parameters
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {string} Normalized chain key
     */
    generateChainKey(playerName, betLevel, coinValue) {
        const baseBetAmount = this.calculateBaseBetAmount(betLevel, coinValue);
        return `${playerName}-${baseBetAmount.toFixed(2)}`;
    }

    /**
     * Check if player already has an active chain
     * @param {string} chainKey - Chain identifier
     * @returns {Object|null} Existing chain or null
     */
    findExistingChain(chainKey) {
        return this.gameData.playerChains[chainKey] || null;
    }

    /**
     * Count active chains for a specific player in memory
     * @param {string} playerName - Player identifier
     * @returns {number} Number of active chains for the player
     */
    countPlayerChainsInMemory(playerName) {
        return Object.keys(this.gameData.playerChains).filter((key) => key.startsWith(`${playerName}-`)).length;
    }

    /**
     * Sort chain keys by activity (most recent first)
     * @param {string[]} chainKeys - Array of chain keys to sort
     * @returns {string[]} Sorted chain keys (most recent activity first)
     */
    sortByActivity(chainKeys) {
        return chainKeys.sort((keyA, keyB) => {
            const chainA = this.gameData.playerChains[keyA];
            const chainB = this.gameData.playerChains[keyB];

            const activityA = new Date(chainA.lastActivityAt || chainA.assignedAt);
            const activityB = new Date(chainB.lastActivityAt || chainB.assignedAt);

            return activityB - activityA; // Most recent first
        });
    }

    /**
     * Remove oldest chains from memory if player has reached the limit
     * @param {string} playerName - Player identifier
     */
    limitPlayerChain(playerName) {
        const MAX_CHAINS_PER_PLAYER = 2;

        const playerChainKeys = Object.keys(this.gameData.playerChains).filter((key) => key.startsWith(`${playerName}-`));

        if (playerChainKeys.length < MAX_CHAINS_PER_PLAYER) {
            return;
        }

        const sortedChainKeys = this.sortByActivity(playerChainKeys);
        const chainsToRemove = sortedChainKeys.slice(MAX_CHAINS_PER_PLAYER);
        chainsToRemove.forEach((chainKey) => {
            delete this.gameData.playerChains[chainKey];
        });
    }

    /**
     * Get total number of cached chains across all players
     * @returns {number} Total number of cached chains
     */
    getAllPlayerChains() {
        return Object.keys(this.gameData.playerChains).length;
    }

    /**
     * Clean up expired chains from memory based on last activity
     */
    cleanExpiredChains() {
        const expirationThreshold = new Date(Date.now() - CHAIN_CONSTANTS.MEMORY_EXPIRATION_MINUTES * 60 * 1000);

        const expiredChainKeys = Object.keys(this.gameData.playerChains).filter((chainKey) => {
            const chain = this.gameData.playerChains[chainKey];
            const lastActivity = new Date(chain.lastActivityAt || chain.assignedAt);

            return lastActivity < expirationThreshold;
        });

        expiredChainKeys.forEach((chainKey) => {
            delete this.gameData.playerChains[chainKey];
        });
    }

    clean() {
        this.cleanExpiredChains();

        const allChainKeys = Object.keys(this.gameData.playerChains);

        if (allChainKeys.length >= CHAIN_CONSTANTS.MAX_GLOBAL_CACHE_SIZE) {
            const sortedChainKeys = this.sortByActivity(allChainKeys);
            const chainsToRemove = sortedChainKeys.slice(CHAIN_CONSTANTS.MAX_GLOBAL_CACHE_SIZE);
            chainsToRemove.forEach((chainKey) => {
                delete this.gameData.playerChains[chainKey];
            });
        }
    }

    /**
     * Update last activity timestamp for a player chain
     * @param {string} chainKey - Chain identifier
     */
    updateChainActivity(chainKey) {
        const chain = this.gameData.playerChains[chainKey];
        if (chain) {
            chain.lastActivityAt = new Date();
        }
    }

    /**
     * Filter available chains by applicable board count
     * @param {Array} availableChains - All available chains
     * @param {number} applicableBoardCount - Maximum boards player can handle
     * @returns {Array} Matching chains
     */
    filterChains(availableChains, applicableBoardCount) {
        return availableChains.filter((chain) => chain.totalBoardCount <= applicableBoardCount);
    }

    /**
     * Select random chain from available options
     * @param {Array} matchingChains - Filtered chains
     * @returns {Object|null} Selected chain or null
     */
    selectRandomChain(matchingChains) {
        if (matchingChains.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * matchingChains.length);
        return matchingChains[randomIndex];
    }

    /**
     * Create player chain entry for memory storage
     * @param {Object} selectedChain - Selected chain metadata
     * @param {Array} boards - Full board data
     * @param {Object} playerContext - Player context data
     * @param {string} playerName - Player name
     * @returns {Object} Player chain object
     */
    createPlayerChainEntry(selectedChain, boards, playerContext, playerName) {
        const { betLevel, coinValue, playerId } = playerContext;
        const now = new Date();
        return {
            name: selectedChain.name,
            boards: [...boards],
            currentIndex: 0,
            totalBoards: boards.length,
            assignedAt: now,
            lastActivityAt: now,
            betLevel,
            coinValue,
            playerId,
            playerName,
            boardsLoaded: true,
        };
    }

    /**
     * Create assignment data for database storage
     * @param {Object} selectedChain - Selected chain metadata
     * @param {Array} boards - Full board data
     * @param {Object} playerContext - Player context data
     * @param {string} playerName - Player name
     * @returns {Object} Assignment data object
     */
    createAssignmentData(selectedChain, boards, playerContext, playerName) {
        const { playerId, operatorId, gameId, chainId, currency, betLevel, coinValue } = playerContext;
        return {
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
    }

    async loadActiveChains() {
        try {
            const activeAssignments = await this.assignmentRepository
                .find({
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .sort({ lastActivityAt: -1, assignedAt: -1 })
                .limit(CHAIN_CONSTANTS.MAX_GLOBAL_CACHE_SIZE)
                .lean()
                .exec();

            for (const assignment of activeAssignments) {
                const chain = this.gameData.availableChains?.find((c) => c.name === assignment.chainName);

                if (chain) {
                    const chainKey = this.generateChainKey(assignment.playerName, assignment.betLevel, assignment.coinValue);
                    this.gameData.playerChains[chainKey] = {
                        name: assignment.chainName,
                        boards: null,
                        currentIndex: assignment.currentBoardIndex,
                        totalBoards: assignment.totalBoards,
                        assignedAt: assignment.assignedAt,
                        lastActivityAt: assignment.lastActivityAt || assignment.assignedAt, // For expiration tracking
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

    /**
     * Find and select an appropriate chain for the player
     * @param {Object} playerContext - Player context data
     * @returns {Object|null} Selected chain or null if none available
     */
    async findSuitableChain(playerContext) {
        const baseBetAmount = this.calculateBaseBetAmount(playerContext.betLevel, playerContext.coinValue);
        const applicableBoardCount = this.getApplicableBoardCount(playerContext, baseBetAmount);
        if (applicableBoardCount === -1) {
            return null;
        }

        const availableChains = this.gameData.availableChains || [];
        const matchingChains = this.filterChains(availableChains, applicableBoardCount);
        return this.selectRandomChain(matchingChains);
    }

    /**
     * Store chain assignment in both memory and database
     * @param {string} chainKey - Chain identifier
     * @param {Object} selectedChain - Selected chain metadata
     * @param {Array} boards - Chain board data
     * @param {Object} playerContext - Player context data
     * @param {string} playerName - Player name
     */
    async storeChainAssignment(chainKey, selectedChain, boards, playerContext, playerName) {
        const playerChainEntry = this.createPlayerChainEntry(selectedChain, boards, playerContext, playerName);
        this.gameData.playerChains[chainKey] = playerChainEntry;

        try {
            const assignmentData = this.createAssignmentData(selectedChain, boards, playerContext, playerName);
            await this.assignmentRepository.create(assignmentData);
        } catch (error) {
            this.logService.logError(`Failed to create chain assignment for ${playerName}: ${error.message}`);
        }
    }

    async assignChain(playerName, playerContext = {}) {
        const { betLevel, coinValue } = playerContext;
        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);

        const existingChain = this.findExistingChain(chainKey);
        if (existingChain) {
            return await this.handleExistingChain(existingChain);
        }

        const selectedChain = await this.findSuitableChain(playerContext);
        if (!selectedChain) {
            return false;
        }

        const boards = await this.chainManager.getBoardsByChainName(selectedChain.name);
        if (!boards) {
            return false;
        }

        this.limitPlayerChain(playerName);
        await this.storeChainAssignment(chainKey, selectedChain, boards, playerContext, playerName);

        return true;
    }

    /**
     * Handle existing chain logic - load boards if needed
     * @param {Object} existingChain - Existing chain object
     * @returns {Promise<boolean>} Always returns false (chain already exists)
     */
    async handleExistingChain(existingChain) {
        if (!existingChain.boardsLoaded) {
            const boards = await this.chainManager.getBoardsByChainName(existingChain.name);
            if (boards) {
                existingChain.boards = [...boards];
                existingChain.boardsLoaded = true;
            }
        }

        return false; // Chain already exists
    }

    async updateChainProgress({ playerId, playerName, betLevel, coinValue, roundBetAmount = 0, roundWinAmount = 0 }) {
        try {
            const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
            const playerChain = this.findExistingChain(chainKey);

            if (!playerChain) {
                return null;
            }

            playerChain.currentIndex += 1;

            const isChainComplete = playerChain.currentIndex >= playerChain.totalBoards;
            const setOptions = {
                lastActivityAt: new Date(),
            };

            if (isChainComplete) {
                setOptions.status = ASSIGNMENT_STATUS.COMPLETED;
                setOptions.completedAt = new Date();
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

            // Only delete from memory after successful database update
            if (isChainComplete) {
                delete this.gameData.playerChains[chainKey];
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

        // Check if applicable boards exceed maximum limit
        if (applicableBoards > CHAIN_CONSTANTS.MAXIMUM_APPLICABLE_BOARDS) {
            return -1;
        }

        return this.getClosestValidBoardCount(applicableBoards);
    }
}
