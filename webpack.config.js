const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  devtool: 'cheap-source-map',

  entry: {
    background: './src/background/background.ts',
    content:    './src/content/content.ts',
    popup:      './src/popup/popup.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true } },
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/popup/popup.html',    to: 'popup.html' },
        { from: 'src/popup/popup.css',     to: 'popup.css' },
        { from: 'src/content/overlay.css', to: 'overlay.css' },
      ],
    }),
  ],
};