#include "fefo/engine.h"
#include <ctype.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif
#ifdef FEFO_TEST_ALLOC_FAILURE
static bool fail_next_allocation=false;
void fefo_test_fail_next_allocation(void){fail_next_allocation=true;}
static bool fefo_should_fail_allocation(void){if(fail_next_allocation){fail_next_allocation=false;return true;}return false;}
static void *fefo_test_malloc(size_t n){if(fefo_should_fail_allocation())return NULL;return malloc(n);}
static void *fefo_test_calloc(size_t n,size_t size){if(fefo_should_fail_allocation())return NULL;return calloc(n,size);}
static void *fefo_test_realloc(void *p,size_t n){if(fefo_should_fail_allocation())return NULL;return realloc(p,n);}
#define malloc(n) fefo_test_malloc(n)
#define calloc(n,s) fefo_test_calloc(n,s)
#define realloc(p,n) fefo_test_realloc(p,n)
#endif
#ifdef FEFO_ENABLE_OPERATION_METRICS
static bool metrics_enabled=false;
static FefoOperationMetrics operation_metrics;
#define METRIC_INC(field) do { if(metrics_enabled) ++operation_metrics.field; } while(0)
#else
#define METRIC_INC(field) ((void)0)
#endif
void fefo_metrics_reset(void){
#ifdef FEFO_ENABLE_OPERATION_METRICS
memset(&operation_metrics,0,sizeof(operation_metrics));
#endif
}
void fefo_metrics_enable(bool enabled){
#ifdef FEFO_ENABLE_OPERATION_METRICS
metrics_enabled=enabled;
#else
(void)enabled;
#endif
}
FefoOperationMetrics fefo_metrics_snapshot(void){
#ifdef FEFO_ENABLE_OPERATION_METRICS
return operation_metrics;
#else
FefoOperationMetrics empty={0};
return empty;
#endif
}
const char *fefo_status_string(FefoStatus s){switch(s){case FEFO_OK:return "ok";case FEFO_ERR_INVALID:return "invalid input";case FEFO_ERR_DUPLICATE:return "duplicate batch ID";case FEFO_ERR_NOMEM:return "out of memory";case FEFO_ERR_EMPTY:return "no eligible stock";default:return "unknown error";}}
const char *policy_name(PolicyKind p){switch(p){case POLICY_HEAP_FEFO:return "FEFO_MIN_HEAP";case POLICY_LINEAR_FEFO:return "FEFO_LINEAR_SCAN";case POLICY_FIFO:return "FIFO";default:return "UNKNOWN";}}
static bool blank(const char *s){const unsigned char *p=(const unsigned char*)s;if(!s||!*s)return true;while(*p){if(!isspace(*p))return false;++p;}return true;}
FefoStatus food_batch_init(FoodBatch *b,const char *id,const char *item,int q,int received,int expiry){size_t ni,nn;if(!b||!id||!item||blank(id)||blank(item)||q<=0||received<0||expiry<received)return FEFO_ERR_INVALID;ni=strlen(id);nn=strlen(item);if(ni>=sizeof(b->id)||nn>=sizeof(b->item))return FEFO_ERR_INVALID;memset(b,0,sizeof(*b));memcpy(b->id,id,ni+1U);memcpy(b->item,item,nn+1U);b->quantity=q;b->received_day=received;b->expiry_day=expiry;b->status=BATCH_ACTIVE;return FEFO_OK;}
bool food_batch_eligible(const FoodBatch *b,int today){return b&&b->status==BATCH_ACTIVE&&b->quantity>0&&today>=0&&today<=b->expiry_day;}
int food_batch_compare(const FoodBatch *a,const FoodBatch *b){int c;METRIC_INC(comparisons);if(a==b)return 0;if(!a)return 1;if(!b)return -1;if(a->expiry_day!=b->expiry_day)return a->expiry_day<b->expiry_day?-1:1;if(a->received_day!=b->received_day)return a->received_day<b->received_day?-1:1;c=strcmp(a->id,b->id);return (c>0)-(c<0);}
static uint64_t hash_id(const char *s){uint64_t h=UINT64_C(14695981039346656037);const unsigned char *p=(const unsigned char*)s;while(*p){h^=*p++;h*=UINT64_C(1099511628211);}return h;}
static size_t slot_of(const char *id,size_t cap){return (size_t)(hash_id(id)&(uint64_t)(cap-1U));}
FoodBatch *inventory_lookup(const Inventory *v,const char *id){size_t s,n;if(!v||!id||!v->map_capacity||!v->slots)return NULL;s=slot_of(id,v->map_capacity);for(n=0;n<v->map_capacity;++n){FoodBatch *b=v->slots[s].batch;if(!b)return NULL;if(strcmp(b->id,id)==0)return b;s=(s+1U)&(v->map_capacity-1U);}return NULL;}
static FefoStatus map_resize(Inventory *v,size_t cap){HashSlot *slots;size_t i;if(cap<16U||(cap&(cap-1U))||cap>SIZE_MAX/sizeof(*slots))return FEFO_ERR_NOMEM;slots=calloc(cap,sizeof(*slots));if(!slots)return FEFO_ERR_NOMEM;for(i=0;i<v->map_capacity;++i){FoodBatch *b=v->slots[i].batch;if(b){size_t s=slot_of(b->id,cap);while(slots[s].batch)s=(s+1U)&(cap-1U);slots[s].batch=b;}}free(v->slots);v->slots=slots;v->map_capacity=cap;return FEFO_OK;}
static FefoStatus map_reserve(Inventory *v){size_t cap;if(!v->map_capacity)return FEFO_ERR_INVALID;{size_t threshold=(v->map_capacity/10U)*7U+((v->map_capacity%10U)*7U)/10U;if(v->map_size<threshold)return FEFO_OK;}cap=v->map_capacity;if(cap>SIZE_MAX/2U)return FEFO_ERR_NOMEM;return map_resize(v,cap*2U);}
static FefoStatus map_insert(Inventory *v,FoodBatch *b){size_t s;FefoStatus e=map_reserve(v);if(e!=FEFO_OK)return e;s=slot_of(b->id,v->map_capacity);while(v->slots[s].batch)s=(s+1U)&(v->map_capacity-1U);v->slots[s].batch=b;++v->map_size;return FEFO_OK;}
static FefoStatus reserve_items(Inventory *v,size_t need){size_t cap;FoodBatch **p;if(need<=v->capacity)return FEFO_OK;cap=v->capacity?v->capacity:16U;while(cap<need){if(cap>SIZE_MAX/2U){cap=need;break;}cap*=2U;}if(cap>SIZE_MAX/sizeof(*p))return FEFO_ERR_NOMEM;p=realloc(v->items,cap*sizeof(*p));if(!p)return FEFO_ERR_NOMEM;v->items=p;v->capacity=cap;return FEFO_OK;}
FefoStatus inventory_init(Inventory *v,PolicyKind kind){if(!v||(kind!=POLICY_HEAP_FEFO&&kind!=POLICY_LINEAR_FEFO&&kind!=POLICY_FIFO))return FEFO_ERR_INVALID;memset(v,0,sizeof(*v));v->kind=kind;v->slots=calloc(16U,sizeof(*v->slots));if(!v->slots)return FEFO_ERR_NOMEM;v->map_capacity=16U;return FEFO_OK;}
void inventory_destroy(Inventory *v){if(v){free(v->items);free(v->slots);memset(v,0,sizeof(*v));}}
static void sift_up(Inventory *v,size_t i){while(i){size_t p=(i-1U)/2U;if(food_batch_compare(v->items[p],v->items[i])<=0)break;{FoodBatch *t=v->items[p];v->items[p]=v->items[i];v->items[i]=t;}METRIC_INC(heap_swaps);i=p;}}
static void sift_down(Inventory *v,size_t i){for(;;){size_t l=i*2U+1U,r=l+1U,b=i;FoodBatch *t;if(l>=v->size)break;if(food_batch_compare(v->items[l],v->items[b])<0)b=l;if(r<v->size&&food_batch_compare(v->items[r],v->items[b])<0)b=r;if(b==i)break;t=v->items[i];v->items[i]=v->items[b];v->items[b]=t;METRIC_INC(heap_swaps);i=b;}}
static void remove_at(Inventory *v,size_t i){if(!v||i>=v->size)return;METRIC_INC(removals);if(v->kind==POLICY_HEAP_FEFO){METRIC_INC(heap_extractions);--v->size;if(i<v->size){v->items[i]=v->items[v->size];if(i&&food_batch_compare(v->items[i],v->items[(i-1U)/2U])<0)sift_up(v,i);else sift_down(v,i);}}else if(v->kind==POLICY_FIFO){if(i+1U<v->size)memmove(&v->items[i],&v->items[i+1U],(v->size-i-1U)*sizeof(*v->items));--v->size;}else{v->items[i]=v->items[v->size-1U];--v->size;}}
bool inventory_heap_valid(const Inventory *v){size_t i;if(!v||v->kind!=POLICY_HEAP_FEFO||v->size>v->capacity||(v->capacity>0U&&!v->items))return false;for(i=0U;i<v->size;++i){if(!v->items[i])return false;if(i>0U&&food_batch_compare(v->items[(i-1U)/2U],v->items[i])>0)return false;}return true;}
FefoStatus inventory_add(Inventory *v,FoodBatch *b,int today){FefoStatus s;FoodBatch *last;if(!v||!b||today<0||b->id[0]=='\0'||!memchr(b->id,'\0',sizeof(b->id))||!memchr(b->item,'\0',sizeof(b->item))||blank(b->id)||blank(b->item)||b->quantity<=0||b->received_day<0||b->expiry_day<b->received_day||b->status!=BATCH_ACTIVE||today>b->expiry_day)return FEFO_ERR_INVALID;if(inventory_lookup(v,b->id))return FEFO_ERR_DUPLICATE;if(v->kind==POLICY_FIFO&&v->size){last=v->items[v->size-1U];if(b->received_day<last->received_day||(b->received_day==last->received_day&&strcmp(b->id,last->id)<0))return FEFO_ERR_INVALID;}s=reserve_items(v,v->size+1U);if(s!=FEFO_OK)return s;s=map_reserve(v);if(s!=FEFO_OK)return s;s=map_insert(v,b);if(s!=FEFO_OK)return s;v->items[v->size]=b;++v->size;METRIC_INC(insertions);if(v->kind==POLICY_HEAP_FEFO)sift_up(v,v->size-1U);return FEFO_OK;}
FefoStatus inventory_purge_expired(Inventory *v,int today,size_t *purged){size_t i,w=0,n=0;if(!v||today<0)return FEFO_ERR_INVALID;if(v->kind==POLICY_HEAP_FEFO){while(v->size&&today>v->items[0]->expiry_day){FoodBatch *b=v->items[0];if(b->status==BATCH_ACTIVE)b->status=BATCH_EXPIRED;remove_at(v,0);++n;}}else{for(i=0;i<v->size;++i){FoodBatch *b=v->items[i];if(today>b->expiry_day||b->status==BATCH_EXPIRED||b->status==BATCH_EXHAUSTED||b->quantity<=0){if(today>b->expiry_day&&b->status==BATCH_ACTIVE)b->status=BATCH_EXPIRED;else if(b->quantity<=0&&b->status==BATCH_ACTIVE)b->status=BATCH_EXHAUSTED;++n;}else v->items[w++]=b;}v->size=w;}if(purged)*purged=n;return FEFO_OK;}
static size_t best_index(const Inventory *v,int today){size_t i,best=SIZE_MAX;if(!v)return SIZE_MAX;if(v->kind==POLICY_HEAP_FEFO||v->kind==POLICY_FIFO)return v->size&&food_batch_eligible(v->items[0],today)?0U:SIZE_MAX;for(i=0;i<v->size;++i)if(food_batch_eligible(v->items[i],today)&&(best==SIZE_MAX||food_batch_compare(v->items[i],v->items[best])<0))best=i;return best;}
FefoStatus inventory_earliest(Inventory *v,int today,FoodBatch **out){size_t i;FefoStatus s;if(!v||!out)return FEFO_ERR_INVALID;*out=NULL;if(v->kind!=POLICY_HEAP_FEFO&&v->kind!=POLICY_LINEAR_FEFO)return FEFO_ERR_INVALID;s=inventory_purge_expired(v,today,NULL);if(s!=FEFO_OK)return s;i=best_index(v,today);if(i==SIZE_MAX)return FEFO_ERR_EMPTY;*out=v->items[i];return FEFO_OK;}
void allocation_result_destroy(AllocationResult *r){if(r){free(r->lines);memset(r,0,sizeof(*r));}}
FefoStatus inventory_allocate(Inventory *v,int request,int today,AllocationResult *out){FefoStatus s;if(!v||!out||request<=0||today<0)return FEFO_ERR_INVALID;allocation_result_destroy(out);out->requested=request;out->shortfall=request;out->outcome=ALLOC_EMPTY;if(v->size){out->lines=calloc(v->size,sizeof(*out->lines));if(!out->lines){memset(out,0,sizeof(*out));return FEFO_ERR_NOMEM;}}s=inventory_purge_expired(v,today,NULL);if(s!=FEFO_OK){allocation_result_destroy(out);return s;}while(out->fulfilled<request){size_t i=best_index(v,today);FoodBatch *b;int left,take;if(i==SIZE_MAX)break;b=v->items[i];left=request-out->fulfilled;take=b->quantity<left?b->quantity:left;memcpy(out->lines[out->line_count].batch_id,b->id,strlen(b->id)+1U);out->lines[out->line_count++].quantity=take;b->quantity-=take;out->fulfilled+=take;if(!b->quantity){b->status=BATCH_EXHAUSTED;remove_at(v,i);}else break;}out->shortfall=request-out->fulfilled;out->outcome=out->fulfilled==0?ALLOC_EMPTY:(out->shortfall==0?ALLOC_FULL:ALLOC_PARTIAL);return FEFO_OK;}
static uint32_t rng_next(uint32_t *s){uint32_t x=*s;if(!x)x=UINT32_C(0x9e3779b9);x^=x<<13;x^=x>>17;x^=x<<5;*s=x;return x;}
static int arrival_cmp(const void *x,const void *y){const ArrivalEvent *a=x,*b=y;if(a->day!=b->day)return a->day<b->day?-1:1;return strcmp(a->batch_id,b->batch_id);}
FefoStatus event_trace_generate(EventTrace *t,size_t count,int days,uint32_t seed,double ratio){size_t i;uint32_t state=seed;unsigned *weights;unsigned long long sum=0;long long target;if(!t||!count||days<1||days>3650||!(ratio>0.0&&ratio<=1.0)||count>SIZE_MAX/sizeof(*t->arrivals))return FEFO_ERR_INVALID;memset(t,0,sizeof(*t));t->arrivals=calloc(count,sizeof(*t->arrivals));t->demands=calloc((size_t)days,sizeof(*t->demands));weights=calloc((size_t)days,sizeof(*weights));if(!t->arrivals||!t->demands||!weights){free(weights);event_trace_destroy(t);return FEFO_ERR_NOMEM;}t->arrival_count=count;t->demand_count=(size_t)days;t->horizon_days=days;t->seed=seed;t->demand_ratio=ratio;if(!state)state=UINT32_C(0x9e3779b9);for(i=0;i<count;++i){ArrivalEvent *e=&t->arrivals[i];int n;e->day=(int)(rng_next(&state)%(uint32_t)days);e->received_day=e->day;e->expiry_day=e->day+1+(int)(rng_next(&state)%14U);e->quantity=1+(int)(rng_next(&state)%10U);n=snprintf(e->batch_id,sizeof(e->batch_id),"B%08zu",i);if(n<0||(size_t)n>=sizeof(e->batch_id)){free(weights);event_trace_destroy(t);return FEFO_ERR_INVALID;}(void)snprintf(e->item,sizeof(e->item),"Synthetic stock pool");t->total_supply+=e->quantity;if(t->total_supply>INT_MAX){free(weights);event_trace_destroy(t);return FEFO_ERR_INVALID;}}qsort(t->arrivals,count,sizeof(*t->arrivals),arrival_cmp);target=(long long)((double)t->total_supply*ratio+0.5);for(i=0;i<(size_t)days;++i){weights[i]=1U+rng_next(&state)%10U;sum+=weights[i];t->demands[i].day=(int)i;}for(i=0;i<(size_t)days;++i){long long q=target*(long long)weights[i]/(long long)sum;t->demands[i].quantity=(int)q;t->total_demand+=q;}if(t->total_demand<target){t->demands[0].quantity+=(int)(target-t->total_demand);t->total_demand=target;}free(weights);return FEFO_OK;}
void event_trace_destroy(EventTrace *t){if(t){free(t->arrivals);free(t->demands);memset(t,0,sizeof(*t));}}
static void waste_account(FoodBatch **pool,size_t count,int day,long long *waste,size_t *batches){size_t i;for(i=0;i<count;++i){FoodBatch *b=pool[i];if(b&&b->status==BATCH_ACTIVE&&b->quantity>0&&day>b->expiry_day){*waste+=b->quantity;++*batches;b->status=BATCH_EXPIRED;}}}
static bool fixed_text_valid(const char *s,size_t cap){return s&&memchr(s,'\0',cap)!=NULL&&!blank(s);}
static bool event_trace_valid(const EventTrace *t){
size_t i;long long supply=0,demand=0;
if(!t||!t->arrivals||!t->demands||!t->arrival_count||!t->demand_count||t->horizon_days<1||!(t->demand_ratio>0.0&&t->demand_ratio<=1.0)||t->total_supply<0||t->total_demand<0||t->arrival_count>SIZE_MAX/sizeof(FoodBatch *))return false;
for(i=0;i<t->arrival_count;++i){const ArrivalEvent *e=&t->arrivals[i];
if(e->day<0||e->day>=t->horizon_days||e->quantity<=0||e->received_day!=e->day||e->expiry_day<e->received_day||!fixed_text_valid(e->batch_id,sizeof(e->batch_id))||!fixed_text_valid(e->item,sizeof(e->item)))return false;
if(i>0U){const ArrivalEvent *p=&t->arrivals[i-1U];if(p->day>e->day||(p->day==e->day&&strcmp(p->batch_id,e->batch_id)>0))return false;}
if(supply>LLONG_MAX-(long long)e->quantity)return false;
supply+=(long long)e->quantity;
}
for(i=0;i<t->demand_count;++i){const DemandEvent *e=&t->demands[i];
if(e->day<0||e->day>=t->horizon_days||e->quantity<0)return false;
if(i>0U&&t->demands[i-1U].day>e->day)return false;
if(demand>LLONG_MAX-(long long)e->quantity)return false;
demand+=(long long)e->quantity;
}
return supply==t->total_supply&&demand==t->total_demand;
}
FefoStatus simulation_run(const EventTrace *t,PolicyKind kind,SimulationResult *r){Inventory v={0};FoodBatch **pool;size_t made=0,ai=0,di=0;int day;FefoStatus s;long long waste=0;size_t expired=0;if(!t||!r)return FEFO_ERR_INVALID;memset(r,0,sizeof(*r));if((kind!=POLICY_HEAP_FEFO&&kind!=POLICY_LINEAR_FEFO&&kind!=POLICY_FIFO)||!event_trace_valid(t))return FEFO_ERR_INVALID;r->policy=kind;pool=calloc(t->arrival_count,sizeof(*pool));if(!pool){memset(r,0,sizeof(*r));return FEFO_ERR_NOMEM;}s=inventory_init(&v,kind);if(s!=FEFO_OK){free(pool);memset(r,0,sizeof(*r));return s;}for(day=0;day<t->horizon_days;++day){while(ai<t->arrival_count&&t->arrivals[ai].day==day){const ArrivalEvent *e=&t->arrivals[ai];FoodBatch *b=malloc(sizeof(*b));if(!b){s=FEFO_ERR_NOMEM;goto done;}s=food_batch_init(b,e->batch_id,e->item,e->quantity,e->received_day,e->expiry_day);if(s==FEFO_OK)s=inventory_add(&v,b,day);if(s!=FEFO_OK){free(b);goto done;}pool[made++]=b;r->supply+=b->quantity;++ai;}waste_account(pool,made,day,&waste,&expired);s=inventory_purge_expired(&v,day,NULL);if(s!=FEFO_OK)goto done;while(di<t->demand_count&&t->demands[di].day==day){int q=t->demands[di++].quantity;AllocationResult a={0};if(q<=0)continue;r->demand+=q;++r->requests;if(kind==POLICY_FIFO&&v.size>1U){size_t j;for(j=1;j<v.size;++j)if(food_batch_eligible(v.items[j],day)&&food_batch_compare(v.items[j],v.items[0])<0){++r->priority_inversions;break;}}s=inventory_allocate(&v,q,day,&a);if(s!=FEFO_OK){allocation_result_destroy(&a);goto done;}r->fulfilled+=a.fulfilled;r->shortfall+=a.shortfall;if(a.fulfilled==q)++r->completed_requests;allocation_result_destroy(&a);}}r->expired=waste;r->expired_batches=expired;{size_t i;for(i=0;i<made;++i)if(pool[i]->status==BATCH_ACTIVE&&pool[i]->quantity>0)r->remaining+=pool[i]->quantity;}s=FEFO_OK;
done:inventory_destroy(&v);while(made)free(pool[--made]);free(pool);if(s!=FEFO_OK)memset(r,0,sizeof(*r));return s;}
void simulation_csv_header(FILE *f){if(f)fprintf(f,"policy,seed,batches,horizon_days,demand_ratio,supply,demand,fulfilled,shortfall,expired,expired_batches,remaining,completed_requests,requests,priority_inversions\n");}
void simulation_csv_row(FILE *f,const EventTrace *t,const SimulationResult *r){if(f&&t&&r)fprintf(f,"%s,%u,%zu,%d,%.2f,%lld,%lld,%lld,%lld,%lld,%zu,%lld,%zu,%zu,%zu\n",policy_name(r->policy),(unsigned)t->seed,t->arrival_count,t->horizon_days,t->demand_ratio,r->supply,r->demand,r->fulfilled,r->shortfall,r->expired,r->expired_batches,r->remaining,r->completed_requests,r->requests,r->priority_inversions);}
static double timer_seconds(void){
#ifdef _WIN32
LARGE_INTEGER f,c;if(QueryPerformanceFrequency(&f)&&QueryPerformanceCounter(&c))return (double)c.QuadPart/(double)f.QuadPart;
#else
struct timespec ts;if(clock_gettime(CLOCK_MONOTONIC,&ts)==0)return (double)ts.tv_sec+(double)ts.tv_nsec/1000000000.0;
#endif
return (double)clock()/(double)CLOCKS_PER_SEC;}
static FefoStatus build_inventory(Inventory *v,FoodBatch *b,size_t n,PolicyKind p){size_t i;FefoStatus s=inventory_init(v,p);if(s!=FEFO_OK)return s;for(i=0;i<n;++i){s=inventory_add(v,&b[i],0);if(s!=FEFO_OK){inventory_destroy(v);return s;}}return FEFO_OK;}
static int compare_doubles(const void *left,const void *right){double a=*(const double*)left,b=*(const double*)right;return (a>b)-(a<b);}
FefoStatus benchmark_structure(FILE *f,FILE *summary){
static const size_t sizes[]={1000U,5000U,10000U,50000U,100000U};
size_t k;
if(!f||!summary)return FEFO_ERR_INVALID;
fprintf(f,"algorithm,n,m,seed,trial,build_seconds,selection_seconds,correctness\n");
fprintf(summary,"n,m,seed,measured_trials,heap_build_median_seconds,heap_build_min_seconds,heap_build_max_seconds,linear_build_median_seconds,linear_build_min_seconds,linear_build_max_seconds,heap_selection_median_seconds,heap_selection_min_seconds,heap_selection_max_seconds,linear_selection_median_seconds,linear_selection_min_seconds,linear_selection_max_seconds,linear_over_heap_median_speedup\n");
for(k=0;k<sizeof(sizes)/sizeof(sizes[0]);++k){
size_t n=sizes[k],m=n<200U?n:200U,i;
FoodBatch *base=calloc(n,sizeof(*base)),*heap_batches=calloc(n,sizeof(*heap_batches)),*linear_batches=calloc(n,sizeof(*linear_batches));
double build_times[2][7]={{0}},selection_times[2][7]={{0}};
uint32_t state=20261009U+(uint32_t)n;
FefoStatus s;
if(!base||!heap_batches||!linear_batches){free(base);free(heap_batches);free(linear_batches);return FEFO_ERR_NOMEM;}
for(i=0;i<n;++i){
char id[FEFO_BATCH_ID_CAP];
int expiry=1+(int)(rng_next(&state)%30U);
(void)snprintf(id,sizeof(id),"B%08zu",i);
s=food_batch_init(&base[i],id,"Synthetic benchmark",1,0,expiry);
if(s!=FEFO_OK){free(base);free(heap_batches);free(linear_batches);return s;}
}
memcpy(heap_batches,base,n*sizeof(*base));
memcpy(linear_batches,base,n*sizeof(*base));
{
Inventory h={0},l={0};
s=build_inventory(&h,heap_batches,n,POLICY_HEAP_FEFO);
if(s==FEFO_OK)s=build_inventory(&l,linear_batches,n,POLICY_LINEAR_FEFO);
if(s!=FEFO_OK){inventory_destroy(&h);inventory_destroy(&l);free(base);free(heap_batches);free(linear_batches);return s;}
for(i=0;i<m;++i){
FoodBatch *x=NULL,*y=NULL;size_t j;
s=inventory_earliest(&h,0,&x);
if(s==FEFO_OK)s=inventory_earliest(&l,0,&y);
if(s!=FEFO_OK||!x||!y||strcmp(x->id,y->id)){
inventory_destroy(&h);inventory_destroy(&l);free(base);free(heap_batches);free(linear_batches);return FEFO_ERR_INVALID;
}
x->quantity=0;x->status=BATCH_EXHAUSTED;y->quantity=0;y->status=BATCH_EXHAUSTED;
for(j=0;j<h.size&&h.items[j]!=x;++j){}
if(j==h.size){inventory_destroy(&h);inventory_destroy(&l);free(base);free(heap_batches);free(linear_batches);return FEFO_ERR_INVALID;}
remove_at(&h,j);
for(j=0;j<l.size&&l.items[j]!=y;++j){}
if(j==l.size){inventory_destroy(&h);inventory_destroy(&l);free(base);free(heap_batches);free(linear_batches);return FEFO_ERR_INVALID;}
remove_at(&l,j);
}
inventory_destroy(&h);inventory_destroy(&l);
}
for(i=0;i<8U;++i){
PolicyKind kinds[2]={i%2U?POLICY_LINEAR_FEFO:POLICY_HEAP_FEFO,i%2U?POLICY_HEAP_FEFO:POLICY_LINEAR_FEFO};
size_t z;
for(z=0;z<2U;++z){
Inventory v={0};double start,build,select;size_t j,algo=kinds[z]==POLICY_HEAP_FEFO?0U:1U;
FoodBatch *work=algo==0U?heap_batches:linear_batches;
memcpy(work,base,n*sizeof(*base));
start=timer_seconds();
s=inventory_init(&v,kinds[z]);
if(s!=FEFO_OK){free(base);free(heap_batches);free(linear_batches);return s;}
for(j=0;j<n;++j){s=inventory_add(&v,&work[j],0);if(s!=FEFO_OK){inventory_destroy(&v);free(base);free(heap_batches);free(linear_batches);return s;}}
build=timer_seconds()-start;
start=timer_seconds();
for(j=0;j<m;++j){
size_t index=best_index(&v,0);FoodBatch *chosen;
if(index==SIZE_MAX){inventory_destroy(&v);free(base);free(heap_batches);free(linear_batches);return FEFO_ERR_INVALID;}
chosen=v.items[index];
chosen->quantity=0;chosen->status=BATCH_EXHAUSTED;remove_at(&v,index);
}
select=timer_seconds()-start;
if(i>0U){
build_times[algo][i-1U]=build;
selection_times[algo][i-1U]=select;
fprintf(f,"%s,%zu,%zu,%u,%zu,%.9f,%.9f,yes\n",algo==0U?"HEAP_FEFO":"LINEAR_FEFO",n,m,(unsigned)(20261009U+(uint32_t)n),i,build,select);
}
inventory_destroy(&v);
}
}
{
double hb[7],hs[7],lb[7],ls[7],speedup;
for(i=0;i<7U;++i){hb[i]=build_times[0][i];hs[i]=selection_times[0][i];lb[i]=build_times[1][i];ls[i]=selection_times[1][i];}
qsort(hb,7U,sizeof(double),compare_doubles);qsort(hs,7U,sizeof(double),compare_doubles);qsort(lb,7U,sizeof(double),compare_doubles);qsort(ls,7U,sizeof(double),compare_doubles);
speedup=hs[3]>0.0?ls[3]/hs[3]:0.0;
fprintf(summary,"%zu,%zu,%u,7,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.9f,%.6f\n",n,m,(unsigned)(20261009U+(uint32_t)n),hb[3],hb[0],hb[6],lb[3],lb[0],lb[6],hs[3],hs[0],hs[6],ls[3],ls[0],ls[6],speedup);
printf("Timing n=%zu m=%zu | build median heap/linear %.6f/%.6f s | selection median heap/linear %.6f/%.6f s | linear/heap %.3fx\n",n,m,hb[3],lb[3],hs[3],ls[3],speedup);
}
printf("n=%zu: heap and linear choices matched for %zu removals\n",n,m);
free(base);free(heap_batches);free(linear_batches);
}
return ferror(f)||ferror(summary)?FEFO_ERR_INVALID:FEFO_OK;
}

FefoStatus benchmark_operation_counts(FILE *f){
static const size_t sizes[]={1000U,5000U,10000U,50000U,100000U};
size_t k;
if(!f)return FEFO_ERR_INVALID;
fprintf(f,"algorithm,n,m,seed,build_comparisons,build_heap_swaps,build_insertions,selection_comparisons,selection_heap_swaps,selection_removals,selection_heap_extractions\n");
for(k=0;k<sizeof(sizes)/sizeof(sizes[0]);++k){
size_t n=sizes[k],m=n<200U?n:200U,i,algo;
FoodBatch *b=calloc(n,sizeof(*b));uint32_t state=20261009U+(uint32_t)n;FefoStatus s;
if(!b)return FEFO_ERR_NOMEM;
for(i=0;i<n;++i){char id[FEFO_BATCH_ID_CAP];int expiry=1+(int)(rng_next(&state)%30U);(void)snprintf(id,sizeof(id),"B%08zu",i);s=food_batch_init(&b[i],id,"Synthetic benchmark",1,0,expiry);if(s!=FEFO_OK){free(b);return s;}}
for(algo=0;algo<2U;++algo){
Inventory v={0};FefoOperationMetrics build,selection;PolicyKind kind=algo==0U?POLICY_HEAP_FEFO:POLICY_LINEAR_FEFO;
for(i=0;i<n;++i){b[i].quantity=1;b[i].status=BATCH_ACTIVE;}
fefo_metrics_reset();fefo_metrics_enable(true);
s=build_inventory(&v,b,n,kind);
fefo_metrics_enable(false);build=fefo_metrics_snapshot();
if(s!=FEFO_OK){inventory_destroy(&v);free(b);return s;}
fefo_metrics_reset();fefo_metrics_enable(true);
for(i=0;i<m;++i){
size_t index=best_index(&v,0);FoodBatch *chosen;
if(index==SIZE_MAX){fefo_metrics_enable(false);inventory_destroy(&v);free(b);return FEFO_ERR_INVALID;}
chosen=v.items[index];chosen->quantity=0;chosen->status=BATCH_EXHAUSTED;remove_at(&v,index);
}
fefo_metrics_enable(false);selection=fefo_metrics_snapshot();
fprintf(f,"%s,%zu,%zu,%u,%llu,%llu,%llu,%llu,%llu,%llu,%llu\n",
algo==0U?"HEAP_FEFO":"LINEAR_FEFO",n,m,(unsigned)(20261009U+(uint32_t)n),
(unsigned long long)build.comparisons,(unsigned long long)build.heap_swaps,(unsigned long long)build.insertions,
(unsigned long long)selection.comparisons,(unsigned long long)selection.heap_swaps,
(unsigned long long)selection.removals,(unsigned long long)selection.heap_extractions);
inventory_destroy(&v);
}
printf("Operation counts n=%zu: heap and linear runs recorded separately\n",n);
free(b);
}
return ferror(f)?FEFO_ERR_INVALID:FEFO_OK;
}
