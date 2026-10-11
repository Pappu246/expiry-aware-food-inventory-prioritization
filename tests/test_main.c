#include "fefo/engine.h"
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>
#include <limits.h>
#define CHECK(x) do{if(!(x)){fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x);return false;}}while(0)
static bool test_batch(void){FoodBatch a,b;CHECK(food_batch_init(&a,"A","Pool",1,0,2)==FEFO_OK);CHECK(food_batch_init(&b,"B","Pool",1,0,4)==FEFO_OK);CHECK(food_batch_compare(&a,&b)<0);CHECK(food_batch_eligible(&a,2));CHECK(!food_batch_eligible(&a,3));CHECK(food_batch_init(&a," ","Pool",1,0,2)==FEFO_ERR_INVALID);return true;}
static bool test_heap(void){FoodBatch b[4];Inventory v={0};FoodBatch *e=NULL;CHECK(inventory_init(&v,POLICY_HEAP_FEFO)==FEFO_OK);CHECK(food_batch_init(&b[0],"D","Pool",1,0,7)==FEFO_OK);CHECK(food_batch_init(&b[1],"B","Pool",1,0,2)==FEFO_OK);CHECK(food_batch_init(&b[2],"A","Pool",1,0,2)==FEFO_OK);CHECK(food_batch_init(&b[3],"C","Pool",1,0,3)==FEFO_OK);for(size_t i=0;i<4;++i)CHECK(inventory_add(&v,&b[i],0)==FEFO_OK);CHECK(inventory_heap_valid(&v));{FoodBatch *bad_items[2]={&b[0],&b[1]};Inventory bad={0};bad.items=bad_items;bad.size=2U;bad.capacity=2U;bad.kind=POLICY_HEAP_FEFO;CHECK(!inventory_heap_valid(&bad));}CHECK(inventory_earliest(&v,0,&e)==FEFO_OK);CHECK(!strcmp(e->id,"A"));inventory_destroy(&v);return true;}
static bool test_duplicate_and_expiry(void){
FoodBatch a,b,many[4];Inventory v={0},bulk={0};FoodBatch *e=NULL;size_t purged=99U;char id[FEFO_BATCH_ID_CAP];
CHECK(food_batch_init(&a,"A","Pool",2,0,3)==FEFO_OK);CHECK(food_batch_init(&b,"A","Pool",2,0,5)==FEFO_OK);
CHECK(inventory_init(&v,POLICY_HEAP_FEFO)==FEFO_OK);CHECK(inventory_add(&v,&a,3)==FEFO_OK);CHECK(inventory_add(&v,&b,3)==FEFO_ERR_DUPLICATE);
CHECK(inventory_earliest(&v,3,&e)==FEFO_OK&&e==&a);CHECK(inventory_earliest(&v,4,&e)==FEFO_ERR_EMPTY);CHECK(a.status==BATCH_EXPIRED);inventory_destroy(&v);
CHECK(inventory_init(&bulk,POLICY_HEAP_FEFO)==FEFO_OK);
for(size_t i=0;i<4U;++i){(void)snprintf(id,sizeof(id),"PURGE-%zu",i);CHECK(food_batch_init(&many[i],id,"Pool",1,0,(int)i+1)==FEFO_OK);CHECK(inventory_add(&bulk,&many[i],0)==FEFO_OK);}
CHECK(inventory_purge_expired(&bulk,3,&purged)==FEFO_OK&&purged==2U&&bulk.size==2U);
CHECK(many[0].status==BATCH_EXPIRED&&many[1].status==BATCH_EXPIRED&&many[2].status==BATCH_ACTIVE&&many[3].status==BATCH_ACTIVE);
CHECK(inventory_heap_valid(&bulk));CHECK(inventory_earliest(&bulk,3,&e)==FEFO_OK&&e==&many[2]);
CHECK(inventory_purge_expired(&bulk,5,&purged)==FEFO_OK&&purged==2U&&bulk.size==0U);
CHECK(many[2].status==BATCH_EXPIRED&&many[3].status==BATCH_EXPIRED&&inventory_heap_valid(&bulk));
inventory_destroy(&bulk);return true;
}
static bool test_allocation(void){FoodBatch a,b;Inventory v={0};AllocationResult r={0};CHECK(food_batch_init(&a,"A","Pool",3,0,2)==FEFO_OK);CHECK(food_batch_init(&b,"B","Pool",5,0,4)==FEFO_OK);CHECK(inventory_init(&v,POLICY_HEAP_FEFO)==FEFO_OK);CHECK(inventory_add(&v,&a,0)==FEFO_OK);CHECK(inventory_add(&v,&b,0)==FEFO_OK);CHECK(inventory_allocate(&v,4,0,&r)==FEFO_OK);CHECK(inventory_heap_valid(&v));CHECK(r.fulfilled==4&&r.shortfall==0&&r.line_count==2);CHECK(!strcmp(r.lines[0].batch_id,"A")&&r.lines[0].quantity==3);CHECK(a.status==BATCH_EXHAUSTED&&b.quantity==4);allocation_result_destroy(&r);CHECK(inventory_allocate(&v,10,0,&r)==FEFO_OK);CHECK(r.fulfilled==4&&r.shortfall==6&&r.outcome==ALLOC_PARTIAL);allocation_result_destroy(&r);inventory_destroy(&v);return true;}
static bool test_hash_growth(void){FoodBatch b[100];Inventory v={0};char id[FEFO_BATCH_ID_CAP];CHECK(inventory_init(&v,POLICY_LINEAR_FEFO)==FEFO_OK);for(size_t i=0;i<100;++i){snprintf(id,sizeof(id),"ID%03zu",i);CHECK(food_batch_init(&b[i],id,"Pool",1,0,4)==FEFO_OK);CHECK(inventory_add(&v,&b[i],0)==FEFO_OK);}CHECK(v.map_size==100&&v.map_capacity>=100);CHECK(inventory_lookup(&v,"ID042")==&b[42]);inventory_destroy(&v);return true;}
static bool test_simulation(void){EventTrace a={0},b={0};SimulationResult x={0},y={0};CHECK(event_trace_generate(&a,150,35,12345U,0.8)==FEFO_OK);CHECK(event_trace_generate(&b,150,35,12345U,0.8)==FEFO_OK);CHECK(a.total_supply==b.total_supply&&a.total_demand==b.total_demand);CHECK(simulation_run(&a,POLICY_HEAP_FEFO,&x)==FEFO_OK);CHECK(simulation_run(&a,POLICY_HEAP_FEFO,&y)==FEFO_OK);CHECK(x.fulfilled==y.fulfilled&&x.expired==y.expired&&x.shortfall==y.shortfall);CHECK(x.fulfilled+x.shortfall==x.demand);event_trace_destroy(&a);event_trace_destroy(&b);return true;}

static bool test_validation_edges(void){
FoodBatch b;EventTrace generated={0},trace={0};ArrivalEvent arrivals[2]={{0}};DemandEvent demands[2]={{0}};SimulationResult result={0};
CHECK(food_batch_init(&b,"A","Pool",0,0,1)==FEFO_ERR_INVALID);CHECK(food_batch_init(&b,"A","Pool",1,3,2)==FEFO_ERR_INVALID);
{Inventory future={0};FoodBatch pending;CHECK(food_batch_init(&pending,"FUTURE","Pool",1,2,5)==FEFO_OK);CHECK(!food_batch_eligible(&pending,1));CHECK(inventory_init(&future,POLICY_HEAP_FEFO)==FEFO_OK);CHECK(inventory_add(&future,&pending,1)==FEFO_ERR_INVALID);CHECK(inventory_add(&future,&pending,2)==FEFO_OK);inventory_destroy(&future);}
CHECK(event_trace_generate(&generated,10,30,1U,NAN)==FEFO_ERR_INVALID);CHECK(generated.arrivals==NULL&&generated.demands==NULL);
for(size_t i=0;i<2U;++i){(void)snprintf(arrivals[i].batch_id,sizeof(arrivals[i].batch_id),"%c",(int)('A'+i));(void)snprintf(arrivals[i].item,sizeof(arrivals[i].item),"Pool");arrivals[i].day=(int)i;arrivals[i].quantity=1;arrivals[i].received_day=(int)i;arrivals[i].expiry_day=(int)i+3;demands[i].day=(int)i;demands[i].quantity=1;}
trace.arrivals=arrivals;trace.arrival_count=2U;trace.demands=demands;trace.demand_count=2U;trace.horizon_days=2;trace.seed=9U;trace.demand_ratio=1.0;trace.total_supply=2;trace.total_demand=2;
CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_OK&&result.supply==2&&result.demand==2);
demands[1].quantity=-1;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID&&result.supply==0);demands[1].quantity=1;
demands[0].day=1;demands[1].day=0;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);demands[0].day=0;demands[1].day=1;
arrivals[0].day=1;arrivals[1].day=0;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);arrivals[0].day=0;arrivals[1].day=1;
arrivals[0].day=2;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);arrivals[0].day=0;
memset(arrivals[0].batch_id,'X',sizeof(arrivals[0].batch_id));CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);(void)snprintf(arrivals[0].batch_id,sizeof(arrivals[0].batch_id),"A");
arrivals[0].expiry_day=-1;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);arrivals[0].expiry_day=3;
arrivals[0].received_day=1;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);arrivals[0].received_day=0;
trace.total_supply=1;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);trace.total_supply=2;
trace.horizon_days=0;CHECK(simulation_run(&trace,POLICY_HEAP_FEFO,&result)==FEFO_ERR_INVALID);trace.horizon_days=2;
CHECK(simulation_run(&trace,(PolicyKind)99,&result)==FEFO_ERR_INVALID);
{Inventory fifo={0};FoodBatch batch;FoodBatch *next=NULL;CHECK(food_batch_init(&batch,"FIFO-1","Pool",1,0,3)==FEFO_OK);CHECK(inventory_init(&fifo,POLICY_FIFO)==FEFO_OK);CHECK(inventory_add(&fifo,&batch,0)==FEFO_OK);CHECK(inventory_earliest(&fifo,0,&next)==FEFO_ERR_INVALID&&next==NULL);inventory_destroy(&fifo);}
return true;
}
static bool test_empty_inventory(void){Inventory v={0};AllocationResult r={0};FoodBatch *b=NULL;CHECK(inventory_init(&v,POLICY_HEAP_FEFO)==FEFO_OK);CHECK(inventory_earliest(&v,0,&b)==FEFO_ERR_EMPTY&&b==NULL);CHECK(inventory_heap_valid(&v));CHECK(inventory_allocate(&v,5,0,&r)==FEFO_OK);CHECK(r.requested==5&&r.fulfilled==0&&r.shortfall==5&&r.outcome==ALLOC_EMPTY&&r.line_count==0);allocation_result_destroy(&r);inventory_destroy(&v);return true;}
static size_t test_hash_bucket(const char *s){uint64_t h=UINT64_C(14695981039346656037);const unsigned char *p=(const unsigned char*)s;while(*p){h^=*p++;h*=UINT64_C(1099511628211);}return (size_t)(h&15U);}
static bool test_hash_collision(void){char first[16][FEFO_BATCH_ID_CAP]={{0}},id[FEFO_BATCH_ID_CAP],left[FEFO_BATCH_ID_CAP]="",right[FEFO_BATCH_ID_CAP]="";FoodBatch a,b;Inventory v={0};bool found=false;for(unsigned int i=0;i<1000U&&!found;++i){size_t slot;(void)snprintf(id,sizeof(id),"COLL-%u",i);slot=test_hash_bucket(id);if(first[slot][0]){(void)snprintf(left,sizeof(left),"%s",first[slot]);(void)snprintf(right,sizeof(right),"%s",id);found=true;}else (void)snprintf(first[slot],sizeof(first[slot]),"%s",id);}CHECK(found);CHECK(food_batch_init(&a,left,"Pool",1,0,3)==FEFO_OK);CHECK(food_batch_init(&b,right,"Pool",1,0,4)==FEFO_OK);CHECK(inventory_init(&v,POLICY_LINEAR_FEFO)==FEFO_OK);CHECK(inventory_add(&v,&a,0)==FEFO_OK);CHECK(inventory_add(&v,&b,0)==FEFO_OK);CHECK(v.map_capacity==16U);CHECK(inventory_lookup(&v,left)==&a&&inventory_lookup(&v,right)==&b);inventory_destroy(&v);return true;}
static bool test_fifo_policy_divergence(void){EventTrace t={0};SimulationResult h={0},f={0};t.arrivals=calloc(2U,sizeof(*t.arrivals));t.demands=calloc(3U,sizeof(*t.demands));if(!t.arrivals||!t.demands){event_trace_destroy(&t);return false;}t.arrival_count=2U;t.demand_count=3U;t.horizon_days=3;t.seed=7U;t.demand_ratio=0.25;t.total_supply=4;t.total_demand=1;
(void)snprintf(t.arrivals[0].batch_id,sizeof(t.arrivals[0].batch_id),"A-LATE");(void)snprintf(t.arrivals[0].item,sizeof(t.arrivals[0].item),"Pool");t.arrivals[0].day=0;t.arrivals[0].received_day=0;t.arrivals[0].expiry_day=8;t.arrivals[0].quantity=2;
(void)snprintf(t.arrivals[1].batch_id,sizeof(t.arrivals[1].batch_id),"B-SOON");(void)snprintf(t.arrivals[1].item,sizeof(t.arrivals[1].item),"Pool");t.arrivals[1].day=0;t.arrivals[1].received_day=0;t.arrivals[1].expiry_day=1;t.arrivals[1].quantity=2;
t.demands[0].day=0;t.demands[0].quantity=1;t.demands[1].day=1;t.demands[1].quantity=0;t.demands[2].day=2;t.demands[2].quantity=0;
CHECK(simulation_run(&t,POLICY_HEAP_FEFO,&h)==FEFO_OK);CHECK(simulation_run(&t,POLICY_FIFO,&f)==FEFO_OK);CHECK(h.demand==1&&f.demand==1&&h.fulfilled==1&&f.fulfilled==1);CHECK(h.expired==1&&f.expired==2);CHECK(f.priority_inversions>0U);CHECK(h.remaining==2&&f.remaining==1);event_trace_destroy(&t);return true;}

static bool test_fifo_control_alignment(void){EventTrace t={0};SimulationResult h={0},f={0};size_t i;t.arrivals=calloc(2U,sizeof(*t.arrivals));t.demands=calloc(6U,sizeof(*t.demands));if(!t.arrivals||!t.demands){event_trace_destroy(&t);return false;}t.arrival_count=2U;t.demand_count=6U;t.horizon_days=6;t.seed=19U;t.demand_ratio=0.25;t.total_supply=4;t.total_demand=1;
(void)snprintf(t.arrivals[0].batch_id,sizeof(t.arrivals[0].batch_id),"A-FIRST");(void)snprintf(t.arrivals[0].item,sizeof(t.arrivals[0].item),"Pool");t.arrivals[0].day=0;t.arrivals[0].received_day=0;t.arrivals[0].expiry_day=2;t.arrivals[0].quantity=2;
(void)snprintf(t.arrivals[1].batch_id,sizeof(t.arrivals[1].batch_id),"B-NEXT");(void)snprintf(t.arrivals[1].item,sizeof(t.arrivals[1].item),"Pool");t.arrivals[1].day=1;t.arrivals[1].received_day=1;t.arrivals[1].expiry_day=3;t.arrivals[1].quantity=2;
for(i=0;i<6U;++i)t.demands[i].day=(int)i;
t.demands[1].quantity=1;
CHECK(simulation_run(&t,POLICY_HEAP_FEFO,&h)==FEFO_OK);CHECK(simulation_run(&t,POLICY_FIFO,&f)==FEFO_OK);CHECK(h.supply==f.supply&&h.demand==f.demand&&h.fulfilled==f.fulfilled&&h.shortfall==f.shortfall&&h.expired==f.expired&&h.remaining==f.remaining);CHECK(h.expired==3&&h.remaining==0&&h.priority_inversions==0U&&f.priority_inversions==0U);event_trace_destroy(&t);return true;}

static bool test_integer_boundaries(void){
FoodBatch b;Inventory v={0};AllocationResult r={0};
CHECK(food_batch_init(&b,"MAX-QTY","Pool",INT_MAX,INT_MAX-1,INT_MAX)==FEFO_OK);
CHECK(food_batch_eligible(&b,INT_MAX));
CHECK(inventory_init(&v,POLICY_HEAP_FEFO)==FEFO_OK);
CHECK(inventory_add(&v,&b,INT_MAX)==FEFO_OK);
CHECK(inventory_allocate(&v,INT_MAX,INT_MAX,&r)==FEFO_OK);
CHECK(r.requested==INT_MAX&&r.fulfilled==INT_MAX&&r.shortfall==0&&r.line_count==1U);
CHECK(r.lines[0].quantity==INT_MAX&&strcmp(r.lines[0].batch_id,"MAX-QTY")==0);
CHECK(b.quantity==0&&b.status==BATCH_EXHAUSTED&&v.size==0U&&inventory_heap_valid(&v));
allocation_result_destroy(&r);inventory_destroy(&v);
CHECK(food_batch_init(&b,"BAD-DAY","Pool",1,INT_MAX,INT_MAX-1)==FEFO_ERR_INVALID);
CHECK(food_batch_init(&b,"BAD-QTY","Pool",INT_MIN,0,INT_MAX)==FEFO_ERR_INVALID);
return true;
}
#ifdef FEFO_TEST_ALLOC_FAILURE
static bool test_allocation_failure_injection(void){
FoodBatch b[12];Inventory v={0};AllocationResult out={0};char id[FEFO_BATCH_ID_CAP];size_t i;
CHECK(inventory_init(&v,POLICY_HEAP_FEFO)==FEFO_OK);
for(i=0;i<12U;++i){(void)snprintf(id,sizeof(id),"FAIL-%02zu",i);CHECK(food_batch_init(&b[i],id,"Pool",1,0,10)==FEFO_OK);}
fefo_test_fail_next_allocation();
CHECK(inventory_add(&v,&b[0],0)==FEFO_ERR_NOMEM);
CHECK(v.size==0U&&v.map_size==0U&&inventory_lookup(&v,"FAIL-00")==NULL);
CHECK(inventory_add(&v,&b[0],0)==FEFO_OK);
for(i=1;i<11U;++i)CHECK(inventory_add(&v,&b[i],0)==FEFO_OK);
CHECK(v.size==11U&&v.map_size==11U&&v.map_capacity==16U);
fefo_test_fail_next_allocation();
CHECK(inventory_add(&v,&b[11],0)==FEFO_ERR_NOMEM);
CHECK(v.size==11U&&v.map_size==11U&&v.map_capacity==16U&&inventory_lookup(&v,"FAIL-11")==NULL);
CHECK(inventory_heap_valid(&v));
CHECK(inventory_add(&v,&b[11],0)==FEFO_OK);
fefo_test_fail_next_allocation();
CHECK(inventory_allocate(&v,1,0,&out)==FEFO_ERR_NOMEM);
CHECK(out.lines==NULL&&out.requested==0&&out.fulfilled==0&&out.shortfall==0);
CHECK(v.size==12U&&b[0].quantity==1&&inventory_lookup(&v,"FAIL-00")==&b[0]);
allocation_result_destroy(&out);inventory_destroy(&v);return true;
}
#endif

static uint32_t test_rng_next(uint32_t *state){uint32_t x=*state;x^=x<<13;x^=x>>17;x^=x<<5;return *state=x;}
static bool test_randomized_differential(void){
enum { BATCHES=64, SEEDS=12 };
uint32_t seed;
for(seed=1U;seed<=SEEDS;++seed){
FoodBatch heap_batches[BATCHES],linear_batches[BATCHES];
Inventory heap={0},linear={0};
AllocationResult hr={0},lr={0};
uint32_t state=UINT32_C(0x5eed1234)^seed;
size_t i,steps=0U;bool both_empty=false;
CHECK(inventory_init(&heap,POLICY_HEAP_FEFO)==FEFO_OK);
CHECK(inventory_init(&linear,POLICY_LINEAR_FEFO)==FEFO_OK);
for(i=0;i<BATCHES;++i){
char id[FEFO_BATCH_ID_CAP];int received=(int)(test_rng_next(&state)%12U);int expiry=11+(int)(test_rng_next(&state)%12U);int quantity=1+(int)(test_rng_next(&state)%4U);
(void)snprintf(id,sizeof(id),"R%02u-%03zu",(unsigned)seed,i);
CHECK(food_batch_init(&heap_batches[i],id,"Random test pool",quantity,received,expiry)==FEFO_OK);
linear_batches[i]=heap_batches[i];
CHECK(inventory_add(&heap,&heap_batches[i],11)==FEFO_OK);
CHECK(inventory_add(&linear,&linear_batches[i],11)==FEFO_OK);
}
while(steps<=(size_t)(BATCHES*4)){
FefoStatus hs=inventory_allocate(&heap,1,11,&hr);
FefoStatus ls=inventory_allocate(&linear,1,11,&lr);
CHECK(hs==FEFO_OK&&ls==FEFO_OK);
CHECK(hr.fulfilled==lr.fulfilled&&hr.shortfall==lr.shortfall&&hr.line_count==lr.line_count&&hr.outcome==lr.outcome);
if(hr.line_count==1U)CHECK(strcmp(hr.lines[0].batch_id,lr.lines[0].batch_id)==0&&hr.lines[0].quantity==lr.lines[0].quantity);
CHECK(inventory_heap_valid(&heap));
++steps;
if(hr.fulfilled==0&&lr.fulfilled==0){both_empty=true;break;}
}
CHECK(both_empty);
allocation_result_destroy(&hr);allocation_result_destroy(&lr);
inventory_destroy(&heap);inventory_destroy(&linear);
}
return true;
}

static int run(const char *name,bool(*fn)(void)){if(fn()){printf("[PASS] %s\n",name);return 0;}fprintf(stderr,"[FAIL] %s\n",name);return 1;}
int main(void){int n=0;int total=13;
n+=run("batch validation and FEFO order",test_batch);
n+=run("heap ordering and tie-break",test_heap);
n+=run("duplicate IDs and expiry boundary",test_duplicate_and_expiry);
n+=run("partial allocation and shortfall",test_allocation);
n+=run("hash table growth and lookup",test_hash_growth);
n+=run("fixed-seed simulation reproducibility",test_simulation);
n+=run("invalid input and NaN rejection",test_validation_edges);
n+=run("empty inventory and request shortfall",test_empty_inventory);
n+=run("hash collision probing",test_hash_collision);
n+=run("FEFO versus FIFO expiry divergence",test_fifo_policy_divergence);
n+=run("FEFO/FIFO aligned-order control",test_fifo_control_alignment);
n+=run("INT_MAX quantity and day-boundary arithmetic",test_integer_boundaries);
n+=run("12-seed randomized heap/linear differential",test_randomized_differential);
#ifdef FEFO_TEST_ALLOC_FAILURE
total++;
n+=run("one-shot allocation failure preserves state",test_allocation_failure_injection);
#endif
printf("Tests: %d/%d passed\n",total-n,total);return n?1:0;}
