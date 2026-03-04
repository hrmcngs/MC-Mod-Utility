module.exports = {
    id: 'fabric',
    displayName: 'Fabric',

    getMetadataFilePath() {
        return 'src/main/resources/fabric.mod.json';
    },

    getLanguageLoader(language) {
        return language === 'kotlin' ? 'fabric-language-kotlin' : null;
    },

    getKotlinDependency(language) {
        if (language === 'kotlin') {
            return 'net.fabricmc:fabric-language-kotlin:1.11.0+kotlin.2.0.0';
        }
        return null;
    },
};
