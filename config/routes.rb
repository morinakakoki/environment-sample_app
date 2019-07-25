Rails.application.routes.draw do
  get 'password_resets/new'
  get 'password_resets/edit'
  root   'static_pages#home'
    get    '/help',    to: 'static_pages#help'
    get    '/about',   to: 'static_pages#about'
    get    '/contact', to: 'static_pages#contact'
    get    '/signup',  to: 'users#new'
    get    '/login',   to: 'sessions#new'
    post   '/login',   to: 'sessions#create'
    delete '/logout',  to: 'sessions#destroy'
    post "signup", to: "users#create"
    get "search_path", to:"users#search"
    resources :users do
   member do
     get :following, :followers
   end
 end
    resources :users
    resources :account_activations, only: [:edit]
    resources :password_resets,     only: [:new, :create, :edit, :update]
     #削除
     resources :relationships,       only: [:create, :destroy]
     #like機能拡張用に指定
  resources :microposts do
    resources :likes, only: [:create, :destroy]
     end
end
