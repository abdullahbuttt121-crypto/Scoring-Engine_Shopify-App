<?php
namespace App\Repositories\ProductVarient;

use App\Http\Traits\ResponseTrait;
use App\Models\Products\ProductVarient;
use App\Repositories\ProductVarient\ProductVarientRepositoryInterface;


class ProductVarientRepository implements ProductVarientRepositoryInterface
{
    use ResponseTrait;
    protected $model;

    public function __construct(ProductVarient $ProductVarient)
    {
        $this->model = $ProductVarient;
    }
    public function getById(int $id)
    {
        $variant = $this->model->find($id);
        return $variant;
    }
    public function getByShopifyId(int $id)
    {
        $variant = $this->model->where('shopify_product_Varient_id', $id)->first();
        return $variant;
    }
    public function getByProductId(int $id)
    {
        $variants = $this->model->where('product_id', $id)->get();
        return $variants;
    }
    public function updateOrCreate(array $data)
    {
        /*
         * BUG FIX: Eloquent's updateOrCreate() requires two arguments.
         * Without splitting, ALL columns become match conditions — every call
         * inserts a new variant row instead of updating the existing one.
         *
         * Match on (product_id + shopify_product_Varient_id) which uniquely
         * identifies a variant for a product.
         */
        $matchKeys = [
            'product_id'                 => $data['product_id'],
            'shopify_product_Varient_id' => $data['shopify_product_Varient_id'],
        ];

        $productVarient = $this->model->updateOrCreate($matchKeys, $data);
        return $productVarient;
    }
    public function delete(int $id)
    {
        $varient = $this->getById($id);
        $varient->delete();
    }
}

