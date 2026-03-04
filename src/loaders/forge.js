module.exports = {
    id: 'forge',
    displayName: 'Forge',

    getMetadataFilePath() {
        return 'src/main/resources/META-INF/mods.toml';
    },

    getLanguageLoader(language) {
        return language === 'kotlin' ? 'kotlinforforge' : 'javafml';
    },

    getKotlinDependency(language) {
        if (language === 'kotlin') {
            return "thedarkcolour:kotlinforforge:4.10.0";
        }
        return null;
    },
};
