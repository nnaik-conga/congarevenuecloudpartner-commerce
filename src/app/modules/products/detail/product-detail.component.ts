import { Component, OnInit, ViewChild, OnDestroy, TemplateRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { first, get, isNil, find, forEach, maxBy, filter, last, defaultTo, set } from 'lodash';
import { combineLatest, Observable, Subscription, of, BehaviorSubject, take } from 'rxjs';
import { switchMap, map as rmap, distinctUntilChanged } from 'rxjs/operators';
import {
  CartService,
  CartItem,
  Product,
  ProductService,
  ProductInformation,
  StorefrontService,
  Storefront,
  PriceListItemService,
  Cart,
  ConstraintRuleService
} from '@congarevenuecloud/ecommerce';
import { ProductConfigurationComponent, ProductConfigurationSummaryComponent, ProductConfigurationService, RevalidateCartService } from '@congarevenuecloud/elements';
import { BsModalRef } from 'ngx-bootstrap/modal';
@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss']
})

export class ProductDetailComponent implements OnInit, OnDestroy {
  @ViewChild('confirmationTemplate') confirmationTemplate: TemplateRef<any>;
  viewState$: BehaviorSubject<ProductDetailsState> = new BehaviorSubject<ProductDetailsState>(null);
  recommendedProducts$: Observable<Array<Product>>;
  attachments$: Observable<Array<ProductInformation>>;
  modalRef: BsModalRef;
  primaryLineItem: CartItem = null;

  cartItemList: Array<CartItem>;
  product: Product;
  subscriptions: Array<Subscription> = new Array<Subscription>();
  configurationChanged: boolean = false;
  currentQty: number;
  relatedTo: CartItem;
  cart: Cart;
  priceInProgress: boolean = false;
  unsavedConfiguration: boolean = false;
  disabled: boolean = false;
  handleredirect: boolean = true;
  activeCart: Cart = null;
  configurationPending: boolean;
  discovery: string;

  @ViewChild(ProductConfigurationSummaryComponent, { static: false })
  configSummaryModal: ProductConfigurationSummaryComponent;
  @ViewChild(ProductConfigurationComponent, { static: false })
  productConfigComponent: ProductConfigurationComponent;
  constructor(private cartService: CartService,
    private router: Router,
    private route: ActivatedRoute,
    private productService: ProductService,
    private revalidateCartService: RevalidateCartService,
    private storefrontService: StorefrontService,
    private productConfigurationService: ProductConfigurationService,
    private crService: ConstraintRuleService) {
  }

  ngOnInit() {
    this.subscriptions.push(this.route.params.pipe(
      switchMap(params => {
        this.productConfigurationService.onChangeConfiguration(null);
        this.product = null;
        this.cartItemList = null;
        const product$ = (this.product instanceof Product && get(params, 'id') === this.product.Id) ? of(this.product) :
          this.productService.fetch(get(params, 'id'));
        const cartItem$ = this.cartService.getMyCart().pipe(
          rmap(cart => {
            this.cart = cart;
            const cartItem = find(get(cart, 'LineItems'), { Id: get(params, 'cartItem') });
            return isNil(get(cartItem, 'Id')) ? null : cartItem;
          }),
          distinctUntilChanged((oldCli, newCli) => get(newCli, 'Quantity') === this.currentQty)
        );
        // TODO: Needs to be removed when product features are part of get products API call (CPQ-52267)
        const productFeatureValues$ = this.productService.getProductsWithFeatureValues([get(params, 'id')]).pipe(rmap((products: Array<Product>) => get(first(products), 'ProductFeatureValues')));
        return combineLatest([product$, cartItem$, this.storefrontService.getStorefront(), this.revalidateCartService.revalidateFlag, productFeatureValues$]);
      }),
      rmap(([product, cartItemList, storefront, revalidate, productFeatureValues]) => {
        this.recommendedProducts$ = this.crService.getRecommendationsForProducts();
        const pli = PriceListItemService.getPriceListItemForProduct(product as Product);
        this.currentQty = isNil(cartItemList) ? defaultTo(get(pli, 'DefaultQuantity'), 1) : get(cartItemList, 'Quantity', 1);
        this.productConfigurationService.changeProductQuantity(this.currentQty);
        this.product = product as Product;
        this.discovery = this.storefrontService.getDiscovery();
        this.disabled = revalidate;
        set(product, 'ProductFeatureValues', productFeatureValues);
        if (!isNil(cartItemList)) this.primaryLineItem = cartItemList;
        return {
          product: product as Product,
          relatedTo: cartItemList,
          quantity: this.currentQty,
          storefront: storefront
        };
      })
    ).subscribe(r => this.viewState$.next(r)));

    this.subscriptions.push(this.productConfigurationService.unsavedConfiguration.subscribe(res => {
      this.unsavedConfiguration = res;
    }));

    this.subscriptions.push(this.productConfigurationService.configurationChange.subscribe(response => {
      if (get(response, 'configurationChanged')) this.configurationChanged = true;
      this.activeCart = get(response, 'cart') ? get(response, 'cart') : null;
      this.configurationPending = get(response, 'hasErrors');
      this.relatedTo = get(this.viewState$, 'value.relatedTo');
      this.product = get(response, 'product') ? get(response, 'product') : this.product;
      this.cartItemList = get(response, 'itemList');
      if (!isNil(this.cartItemList)) this.primaryLineItem = find(this.cartItemList, (r) => get(r, 'LineType') == 'Product/Service');
    }));
  }

  onConfigurationChange(result: any) {
    this.product = first(result);
    this.cartItemList = result[1];
    if (get(last(result), 'optionChanged') || get(last(result), 'attributeChanged')) this.configurationChanged = true;
  }

  handleStartChange(cartItem: CartItem) {
    this.cartService.updateCartItems([cartItem]);
  }

  onAddToCart(cartItems: Array<CartItem>): void {
    this.productConfigurationService.unsavedConfiguration.next(false);
    this.configurationChanged = false;
    const primaryItem = find(cartItems, i => get(i, 'IsPrimaryLine') === true && isNil(get(i, 'Option')));
    if (!isNil(primaryItem) && (get(primaryItem, 'Product.HasOptions') || get(primaryItem, 'Product.HasAttributes'))) {
      this.router.navigate(['/products', get(this, 'product.Id'), get(primaryItem, 'Id')]);
    }


    if (!isNil(this.relatedTo) && (get(this.relatedTo, 'HasOptions') || get(this.relatedTo, 'HasAttributes')))
      this.router.navigate(['/products', get(this.viewState$, 'value.product.Id'), get(this.relatedTo, 'Id')]);

    this.productConfigurationService.onChangeConfiguration({
      product: get(this, 'product'),
      itemList: cartItems,
      configurationChanged: false,
      hasErrors: false
    });
  }

  changeProductQuantity(newQty: any) {
    if (this.cartItemList && this.cartItemList.length > 0)
      forEach(this.cartItemList, c => {
        if (c.LineType === 'Product/Service') c.Quantity = newQty;
        this.productConfigurationService.changeProductQuantity(newQty, c);
      });
  }

  changeProductToOptional(event: boolean) {
    if (this.cartItemList && this.cartItemList.length > 0)
      forEach(this.cartItemList, c => {
        c.IsOptional = event;
      });
      this.productConfigurationService.changeItemToOptional(this.cartItemList);
  }

  handleEndDateChange(cartItem: CartItem) {
    this.cartService.updateCartItems([cartItem]);
  }

  showSummary() {
    this.configSummaryModal.show();
  }

  getPrimaryItem(cartItems: Array<CartItem>): CartItem {
    let primaryItem: CartItem;
    if (isNil(this.relatedTo)) {
      primaryItem = maxBy(filter(cartItems, i => get(i, 'LineType') === 'Product/Service' && isNil(get(i, 'Option')) && get(this, 'product.Id') === get(i, 'ProductId')), 'PrimaryLineNumber');
    }
    else {
      primaryItem = find(cartItems, i => get(i, 'LineType') === 'Product/Service' && i.PrimaryLineNumber === get(this, 'relatedTo.PrimaryLineNumber') && isNil(get(i, 'Option')));
    }
    return primaryItem;
  }

  ngOnDestroy() {
    forEach(this.subscriptions, item => {
      if (item) item.unsubscribe();
    });
  }
}

export interface ProductDetailsState {
  // The product to display.
  product: Product;
  // The CartItem related to this product.
  relatedTo: CartItem;
  // Quantity to set to child components
  quantity: number;
  // The storefront.
  storefront: Storefront;
}
