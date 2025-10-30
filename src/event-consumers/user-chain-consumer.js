import crypto from "crypto";

const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

const RTP_TYPE = {
    HIGH: "high",
    BALANCE: "balance",
};

// Chain RTP categorization based on chain names
const RTP_CHAIN_CATEGORIES = {
    [RTP_TYPE.HIGH]: ["discovery", "cliffhanger"],
    [RTP_TYPE.BALANCE]: ["tease", "wave", "comeback"],
};

export { RTP_TYPE };

export default class UserChainConsumer {
    constructor({ gameData, assignmentRepository, logService, appConfigs }) {
        this.gameData = gameData;
        this.assignmentRepository = assignmentRepository;
        this.logService = logService;
        this.appConfigs = appConfigs;

        this.gameData.playerChains = this.gameData.playerChains || {};
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
     * Check if result chains are enabled from gameConfigs
     * @returns {boolean} - True if chains are enabled
     */
    isChainEnabled() {
        return this.gameData.gameConfigs?.cascadingSlotsConfig?.resultChains?.enabled || false;
    }

    /**
     * Get RTP type for a given chain name
     * @param {string} chainName - Name of the chain
     * @returns {string|null} RTP type (HIGH, BALANCE) or null if not categorized
     */
    getChainRTPType(chainName) {
        for (const [rtpType, chainNames] of Object.entries(RTP_CHAIN_CATEGORIES)) {
            if (chainNames.some((name) => chainName.toLowerCase().startsWith(name.toLowerCase() + "-"))) {
                return rtpType;
            }
        }
        return null;
    }

    /**
     * Get the RTP type of player's last completed assignment
     * @param {string} playerName - Player identifier
     * @returns {Promise<string|null>} RTP type of last completed assignment or null
     */
    async getLastCompletedAssignmentRTPType(playerName) {
        try {
            const lastCompletedAssignment = await this.assignmentRepository
                .findOne({
                    playerName,
                    status: ASSIGNMENT_STATUS.COMPLETED,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .sort({ completedAt: -1 })
                .lean()
                .exec();

            if (!lastCompletedAssignment) {
                return null;
            }

            return this.getChainRTPType(lastCompletedAssignment.chainName);
        } catch (error) {
            this.logService.logError(`Failed to get last completed assignment RTP type for ${playerName}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get RTP filter for cooldown strategy
     * @param {string} playerName - Player identifier
     * @returns {Promise<string|null>} RTP filter type or null
     */
    async getRTPFilter(playerName) {
        const lastRTP = await this.getLastCompletedAssignmentRTPType(playerName);
        return lastRTP === RTP_TYPE.HIGH ? RTP_TYPE.BALANCE : null;
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
     * Limit chains per player - remove oldest chains if any player exceeds the limit
     */
    limitPerPlayer() {
        const MAX_PER_PLAYER = 2;
        const { playerChains } = this.gameData;

        const groups = this.groupChainsByPlayer();

        Object.entries(groups).forEach(([playerName, keys]) => {
            if (keys.length > MAX_PER_PLAYER) {
                const sorted = this.sortByActivity(keys);
                const toRemove = sorted.slice(MAX_PER_PLAYER);
                toRemove.forEach((key) => {
                    delete playerChains[key];
                });
            }
        });
    }

    /**
     * Group chain keys by player name
     * @returns {Object} Object with playerName as key and array of chainKeys as value
     */
    groupChainsByPlayer() {
        const { playerChains } = this.gameData;
        const groups = {};

        Object.keys(playerChains).forEach((key) => {
            const playerName = key.split("-")[0]; // Extract player name from "playerName-baseBetAmount"
            if (!groups[playerName]) {
                groups[playerName] = [];
            }
            groups[playerName].push(key);
        });

        return groups;
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
    cleanExpired() {
        const { memoryExpirationMinutes } = this.appConfigs?.resultChains;

        if (!memoryExpirationMinutes) {
            return;
        }

        const threshold = new Date(Date.now() - memoryExpirationMinutes * 60 * 1000);
        const { playerChains } = this.gameData;

        const expiredKeys = Object.keys(playerChains).filter((key) => {
            const { lastActivityAt, assignedAt } = playerChains[key];
            const lastActivity = new Date(lastActivityAt || assignedAt);

            return lastActivity < threshold;
        });

        expiredKeys.forEach((key) => {
            delete playerChains[key];
        });
    }

    clean() {
        if (!this.isChainEnabled()) {
            return;
        }

        this.cleanExpired();
        this.limitPerPlayer();
        this.enforceGlobalLimit();
    }

    /**
     * Enforce global cache limit by removing oldest chains
     */
    enforceGlobalLimit() {
        const { playerChains } = this.gameData;
        const allKeys = Object.keys(playerChains);
        const { maxPlayerChains } = this.appConfigs?.resultChains;

        if (allKeys.length >= maxPlayerChains) {
            const sortedKeys = this.sortByActivity(allKeys);
            const toRemove = sortedKeys.slice(maxPlayerChains);

            toRemove.forEach((key) => {
                delete playerChains[key];
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
     * Filter available chains by applicable board count, volatility, and RTP type
     * @param {Array} availableChains - All available chains
     * @param {number} applicableBoardCount - Closest valid board count for player
     * @param {number|null} volatility - Volatility level from gameConfigs (1-5)
     * @param {string|null} rtpType - RTP type filter (HIGH, BALANCE, or null for no RTP filtering)
     * @returns {Array} Matching chains
     */
    filterChains(availableChains, applicableBoardCount, volatility = null, rtpType = null) {
        return availableChains.filter((chain) => {
            const boardCountMatches = chain.totalBoardCount === applicableBoardCount;

            if (!volatility && !rtpType) {
                return boardCountMatches;
            }

            let matches = boardCountMatches;

            if (volatility) {
                const volatilityMatches = chain.volatility === volatility;
                matches = matches && volatilityMatches;
            }

            if (rtpType) {
                const rtpMatches = this.getChainRTPType(chain.name) === rtpType;
                matches = matches && rtpMatches;
            }

            return matches;
        });
    }

    /**
     * Select random chain from available options using cryptographically secure randomness
     * @param {Array} matchingChains - Filtered chains
     * @returns {Object|null} Selected chain or null
     */
    selectRandom(chains) {
        if (chains.length === 0) {
            return null;
        }
        const index = crypto.randomInt(0, chains.length);

        return chains[index];
    }

    /**
     * Create player chain entry for memory storage
     * @param {Object} chain - Selected chain metadata
     * @param {Object} context - Player context data
     * @param {string} playerName - Player name
     * @returns {Object} Player chain object
     */
    createChainEntry(chain, context, playerName) {
        const now = new Date();

        return {
            ...context,
            name: chain.name,
            currentIndex: 0,
            totalBoards: chain.totalBoardCount,
            assignedAt: now,
            lastActivityAt: now,
            playerName,
        };
    }

    /**
     * Create assignment data for database storage
     * @param {Object} chain - Selected chain metadata
     * @param {Object} context - Player context data
     * @param {string} playerName - Player name
     * @returns {Object} Assignment data object
     */
    createAssignmentData(chain, context, playerName) {
        const now = new Date();
        return {
            ...context,
            playerName,
            chainName: chain.name,
            currentBoardIndex: 0,
            totalBoards: chain.totalBoardCount,
            assignedAt: now,
            lastActivityAt: now,
            status: ASSIGNMENT_STATUS.ACTIVE,
            totalWinAmount: 0,
            totalBetAmount: 0,
        };
    }

    async loadActive() {
        if (!this.isChainEnabled()) {
            return;
        }

        try {
            const { memoryExpirationMinutes: expMinutes, maxPlayerChains: maxChains } = this.appConfigs?.resultChains;

            if (!expMinutes || !maxChains) {
                this.logService.logError(
                    `[GameID: ${this.gameData.gameConfigs?.gameId}] memoryExpirationMinutes or maxPlayerChains is not configured in appConfigs.resultChains`
                );
                return;
            }

            const threshold = new Date(Date.now() - expMinutes * 60 * 1000);
            const { gameId } = this.gameData.gameConfigs;

            const assignments = await this.assignmentRepository
                .find({
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId,
                    $or: [{ lastActivityAt: { $gte: threshold } }, { lastActivityAt: { $exists: false }, assignedAt: { $gte: threshold } }],
                })
                .sort({ lastActivityAt: -1, assignedAt: -1 })
                .limit(maxChains)
                .lean()
                .exec();

            this.loadAssignments(assignments);
        } catch (error) {
            this.logService.logError(`Failed to load active chains:`, error);
        }
    }

    /**
     * Load assignments into memory
     * @param {Array} assignments - Array of assignment objects
     */
    loadAssignments(assignments) {
        const { availableChains, playerChains } = this.gameData;

        for (const assignment of assignments) {
            const chain = availableChains?.find(({ name }) => name === assignment.chainName);

            if (chain) {
                const { playerName, betLevel, coinValue, chainName, currentBoardIndex, totalBoards, assignedAt, lastActivityAt, playerId } =
                    assignment;
                const key = this.generateChainKey(playerName, betLevel, coinValue);

                playerChains[key] = {
                    name: chainName,
                    currentIndex: currentBoardIndex,
                    totalBoards,
                    assignedAt,
                    lastActivityAt: lastActivityAt || assignedAt, // For expiration tracking
                    betLevel,
                    coinValue,
                    playerId,
                    playerName,
                };
            }
        }
    }

    /**
     * Find and select an appropriate chain for the player
     * @param {Object} playerContext - Player context data
     * @returns {Object|null} Selected chain or null if none available
     */
    async findSuitable(playerContext) {
        const { betLevel, coinValue, playerName } = playerContext;
        const baseBet = this.calculateBaseBetAmount(betLevel, coinValue);
        const boardCount = this.getApplicableBoardCount(playerContext, baseBet);

        if (boardCount === -1) {
            return null;
        }

        const { availableChains = [] } = this.gameData;
        const volatility = this.gameData.gameConfigs?.cascadingSlotsConfig?.volatility || null;

        const rtp = await this.getRTPFilter(playerName);
        const matchingChains = this.filterChains(availableChains, boardCount, volatility, rtp);

        return this.selectRandom(matchingChains);
    }

    /**
     * Store chain assignment in both memory and database
     * @param {string} key - Chain identifier
     * @param {Object} chain - Selected chain metadata
     * @param {Object} context - Player context data
     * @param {string} playerName - Player name
     */
    async storeAssignment(key, chain, context, playerName) {
        const { playerChains } = this.gameData;
        const entry = this.createChainEntry(chain, context, playerName);
        playerChains[key] = entry;

        try {
            const data = this.createAssignmentData(chain, context, playerName);
            await this.assignmentRepository.create(data);
        } catch (error) {
            this.logService.logError(`Failed to create chain assignment for ${playerName}: ${error.message}`);
        }
    }

    async assignChain(playerName, playerContext = {}) {
        const { betLevel, coinValue } = playerContext;

        // Check if result chains are enabled
        if (!this.isChainEnabled()) {
            return false;
        }

        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);

        // Check if player already has an active chain in memory
        const existingChain = this.findExistingChain(chainKey);
        if (existingChain) {
            return false; // Chain already exists
        }

        // Check if player has an active assignment in database
        try {
            const activeAssignment = await this.assignmentRepository
                .findOne({
                    playerName,
                    betLevel,
                    coinValue,
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .lean()
                .exec();

            if (activeAssignment) {
                return false; // Player already has an active assignment
            }
        } catch (error) {
            this.logService.logError(`Failed to check database for active chain assignment: ${error.message}`);
            return false;
        }

        // Find and assign a suitable chain
        const selectedChain = await this.findSuitable(playerContext);
        if (!selectedChain) {
            return false;
        }

        await this.storeAssignment(chainKey, selectedChain, playerContext, playerName);

        return true;
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
                    chainName: playerChain.name,
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
        const { minPlayableBoards, boardsMultiplier, maxBoards } = this.appConfigs?.resultChains?.assignment || {};

        if (!minPlayableBoards || boardsMultiplier === undefined || !maxBoards) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] missing configuration in appConfigs.resultChains.assignment`);
            return -1;
        }

        if (playableBoards < minPlayableBoards) {
            return -1;
        }

        return Math.floor(playableBoards + boardsMultiplier * playableBoards);
    }

    getClosestValidBoardCount(applicableBoards) {
        const { boardRange } = this.appConfigs?.resultChains?.assignment || {};

        if (boardRange?.length === 0) {
            this.logService.logError(
                `[GameID: ${this.gameData.gameConfigs?.gameId}] boardRange is not configured or invalid in appConfigs.resultChains.assignment`
            );

            return -1;
        }

        const maxBoardCount = Math.max(...boardRange);
        if (applicableBoards > maxBoardCount) {
            return -1;
        }

        return boardRange.reduce((closest, current) => {
            return Math.abs(current - applicableBoards) < Math.abs(closest - applicableBoards) ? current : closest;
        });
    }

    getApplicableBoardCount(playerContext, baseBetAmount) {
        const { balance = 0 } = playerContext;
        const betMultiplier = this.gameData.gameConfigs?.cascadingSlotsConfig?.betMultiplier || 1;
        const validation = this.validateBoardRequirements(balance, baseBetAmount, betMultiplier);

        if (!validation.isValid) {
            return -1;
        }

        return this.getClosestValidBoardCount(validation.applicableBoards);
    }

    /**
     * Validate all board calculation requirements
     * @param {number} balance - Player balance
     * @param {number} baseBetAmount - Base bet amount
     * @param {number} betMultiplier - Bet multiplier
     * @returns {Object} Validation result with isValid flag and applicableBoards
     */
    validateBoardRequirements(balance, baseBetAmount, betMultiplier) {
        const playableBoards = this.getPlayableBoards(balance, baseBetAmount, betMultiplier);

        if (playableBoards === -1) {
            return { isValid: false };
        }
        const applicableBoards = this.getApplicableBoards(playableBoards);

        if (applicableBoards === -1) {
            return { isValid: false };
        }

        return { isValid: true, applicableBoards };
    }
}
