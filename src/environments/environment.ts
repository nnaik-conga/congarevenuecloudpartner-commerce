import { Configuration } from '@congarevenuecloud/core';

export const environment: Configuration = {
  production: false,
  defaultImageSrc: './assets/images/default.png',
  defaultCountry: 'US',
  defaultLanguage: 'en-US',
  defaultCurrency: 'USD',
  productIdentifier: 'Id',
  translationModule: 'Digital Commerce',
  hashRouting: true,
  storefrontId: 'Enter your storefront ID here',
  endpoint: 'Enter your endpoint URL here',
  clientId: 'Enter your client ID here',
  authority: 'Enter your authority URL here'
};
