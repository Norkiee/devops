const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// Backend base URL is baked in at build time. Override per environment with:
//   TASKLIST_API_URL=https://your-project.vercel.app npm run build
const API_URL = process.env.TASKLIST_API_URL || 'https://devops-omega-tan.vercel.app';

module.exports = (env, argv) => ({
  entry: {
    main: './src/main.ts',
    ui: './src/ui.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/ui.html',
      filename: 'ui.html',
      chunks: ['ui'],
      inject: 'body',
      cache: false,
    }),
    new HtmlInlineScriptPlugin(),
    new MiniCssExtractPlugin(),
    new webpack.DefinePlugin({
      __API_URL__: JSON.stringify(API_URL),
    }),
  ],
});
