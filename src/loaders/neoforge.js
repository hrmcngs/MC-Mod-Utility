module.exports = {
    id: 'neoforge',
    displayName: 'NeoForge',

    getMetadataFilePath() {
        return 'src/main/resources/META-INF/neoforge.mods.toml';
    },

    getLanguageLoader(language) {
        return language === 'kotlin' ? 'kotlinforforge' : 'javafml';
    },

    getKotlinDependency(language) {
        if (language === 'kotlin') {
            return 'thedarkcolour:kotlinforforge-neoforge:5.3.0';
        }
        return null;
    },
};
