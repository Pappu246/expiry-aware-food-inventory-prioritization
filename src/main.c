#include "fefo/engine.h"
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <direct.h>
#else
#include <sys/stat.h>
#endif
static void make_dirs(void){
#ifdef _WIN32
(void)_mkdir("results");(void)_mkdir("results/generated");
#else
(void)mkdir("results",0755);(void)mkdir("results/generated",0755);
#endif
}
static void usage(const char *p){printf("Expiry-Aware Food Inventory Prioritization Engine (C11)\nUsage:\n  %s demo\n  %s simulate [batches]\n  %s experiment\n  %s benchmark\n  %s help\nSynthetic data only; not a food-safety certification tool.\n",p,p,p,p,p);}
static int demo(void){FoodBatch b[3];Inventory v={0};AllocationResult a={0};FoodBatch *e=NULL;FefoStatus s;size_t i;s=food_batch_init(&b[0],"RICE-01","Rice pool",5,0,3);if(s==FEFO_OK)s=food_batch_init(&b[1],"RICE-02","Rice pool",8,0,6);if(s==FEFO_OK)s=food_batch_init(&b[2],"RICE-03","Rice pool",4,1,2);if(s==FEFO_OK)s=inventory_init(&v,POLICY_HEAP_FEFO);for(i=0;s==FEFO_OK&&i<3U;++i)s=inventory_add(&v,&b[i],1);if(s==FEFO_OK)s=inventory_earliest(&v,1,&e);if(s==FEFO_OK){printf("Earliest eligible: %s (expiry day %d, quantity %d)\n",e->id,e->expiry_day,e->quantity);s=inventory_allocate(&v,7,1,&a);}if(s==FEFO_OK){printf("Requested %d, fulfilled %d, shortfall %d\n",a.requested,a.fulfilled,a.shortfall);for(i=0;i<a.line_count;++i)printf("  allocated %d from %s\n",a.lines[i].quantity,a.lines[i].batch_id);}else fprintf(stderr,"Demo failed: %s\n",fefo_status_string(s));allocation_result_destroy(&a);inventory_destroy(&v);return s==FEFO_OK?0:1;}
static bool parse_count(const char *s,size_t *n){char *end=NULL;unsigned long long v;if(!s||!*s||*s=='-'||!n)return false;errno=0;v=strtoull(s,&end,10);if(errno||end==s||*end||v<1||v>100000)return false;*n=(size_t)v;return true;}
static int simulate(size_t n){const PolicyKind policies[]={POLICY_HEAP_FEFO,POLICY_LINEAR_FEFO,POLICY_FIFO};EventTrace t={0};SimulationResult r[3];FILE *f;size_t i;FefoStatus s=event_trace_generate(&t,n,35,20261009U,0.80);if(s!=FEFO_OK){fprintf(stderr,"Trace generation failed: %s\n",fefo_status_string(s));return 1;}for(i=0;i<3;++i){s=simulation_run(&t,policies[i],&r[i]);if(s!=FEFO_OK){fprintf(stderr,"Simulation failed: %s\n",fefo_status_string(s));event_trace_destroy(&t);return 1;}}make_dirs();f=fopen("results/generated/policy_simulation.csv","w");if(!f){event_trace_destroy(&t);return 1;}simulation_csv_header(f);for(i=0;i<3;++i)simulation_csv_row(f,&t,&r[i]);if(fclose(f)!=0){event_trace_destroy(&t);return 1;}printf("Synthetic trace: %zu batches, %d days, seed %u, demand/supply %.2f\n",n,t.horizon_days,(unsigned)t.seed,t.demand_ratio);printf("%-18s %9s %9s %9s %9s %9s %9s\n","Policy","Supply","Demand","Fulfilled","Shortfall","Expired","Remaining");for(i=0;i<3;++i)printf("%-18s %9lld %9lld %9lld %9lld %9lld %9lld\n",policy_name(r[i].policy),r[i].supply,r[i].demand,r[i].fulfilled,r[i].shortfall,r[i].expired,r[i].remaining);puts("CSV: results/generated/policy_simulation.csv");event_trace_destroy(&t);return 0;}
static void metric_mean_sd(const double values[10],double *mean,double *sd){size_t i;double sum=0.0,squares=0.0;for(i=0;i<10U;++i)sum+=values[i];*mean=sum/10.0;for(i=0;i<10U;++i){double delta=values[i]-*mean;squares+=delta*delta;}*sd=sqrt(squares/9.0);}
static int experiment(void){
static const size_t sizes[3]={1000U,5000U,10000U};
static const double ratios[3]={0.50,0.80,1.00};
static const PolicyKind policies[2]={POLICY_HEAP_FEFO,POLICY_FIFO};
enum { SIZE_COUNT=3, RATIO_COUNT=3, POLICY_COUNT=2, METRIC_COUNT=7, SEED_COUNT=10 };
double samples[SIZE_COUNT][RATIO_COUNT][POLICY_COUNT][METRIC_COUNT][SEED_COUNT];
FILE *raw=NULL,*summary=NULL;size_t si,ri,seed_index,pi;int failed=0;
memset(samples,0,sizeof(samples));
make_dirs();
raw=fopen("results/generated/policy_experiment_raw.csv","w");
summary=fopen("results/generated/policy_experiment_summary.csv","w");
if(!raw||!summary){if(raw)(void)fclose(raw);if(summary)(void)fclose(summary);fprintf(stderr,"Unable to create policy experiment CSV files.\n");return 1;}
simulation_csv_header(raw);
fprintf(summary,"batches,demand_ratio,policy,seeds,horizon_days,mean_supply,sd_supply,mean_demand,sd_demand,mean_fulfilled,sd_fulfilled,mean_shortfall,sd_shortfall,mean_expired,sd_expired,mean_remaining,sd_remaining,mean_priority_inversions,sd_priority_inversions\n");
for(si=0;si<SIZE_COUNT&&!failed;++si){
 for(ri=0;ri<RATIO_COUNT&&!failed;++ri){
  for(seed_index=0;seed_index<SEED_COUNT&&!failed;++seed_index){
   EventTrace trace={0};uint32_t seed=UINT32_C(20261009)+(uint32_t)(si*1000U+seed_index);
   FefoStatus status=event_trace_generate(&trace,sizes[si],35,seed,ratios[ri]);
   if(status!=FEFO_OK){event_trace_destroy(&trace);fprintf(stderr,"Experiment trace generation failed: %s\n",fefo_status_string(status));failed=1;break;}
   for(pi=0;pi<POLICY_COUNT;++pi){
    SimulationResult result={0};
    status=simulation_run(&trace,policies[pi],&result);
    if(status!=FEFO_OK){fprintf(stderr,"Experiment policy run failed: %s\n",fefo_status_string(status));failed=1;break;}
    simulation_csv_row(raw,&trace,&result);
    samples[si][ri][pi][0][seed_index]=(double)result.supply;
    samples[si][ri][pi][1][seed_index]=(double)result.demand;
    samples[si][ri][pi][2][seed_index]=(double)result.fulfilled;
    samples[si][ri][pi][3][seed_index]=(double)result.shortfall;
    samples[si][ri][pi][4][seed_index]=(double)result.expired;
    samples[si][ri][pi][5][seed_index]=(double)result.remaining;
    samples[si][ri][pi][6][seed_index]=(double)result.priority_inversions;
   }
   event_trace_destroy(&trace);
   if(ferror(raw)){fprintf(stderr,"Write failed for raw policy experiment CSV.\n");failed=1;break;}
  }
 }
}
for(si=0;si<SIZE_COUNT&&!failed;++si){
 for(ri=0;ri<RATIO_COUNT&&!failed;++ri){
  for(pi=0;pi<POLICY_COUNT;++pi){
   double means[METRIC_COUNT],sds[METRIC_COUNT];size_t metric;
   for(metric=0;metric<METRIC_COUNT;++metric)metric_mean_sd(samples[si][ri][pi][metric],&means[metric],&sds[metric]);
   fprintf(summary,"%zu,%.2f,%s,%u,35,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f\n",
     sizes[si],ratios[ri],policy_name(policies[pi]),(unsigned)SEED_COUNT,
     means[0],sds[0],means[1],sds[1],means[2],sds[2],means[3],sds[3],means[4],sds[4],means[5],sds[5],means[6],sds[6]);
  }
 }
}
if(ferror(summary))failed=1;
if(fclose(raw)!=0)failed=1;
if(fclose(summary)!=0)failed=1;
if(failed){fprintf(stderr,"Policy experiment failed; partial CSVs are not valid final results.\n");return 1;}
printf("Policy matrix complete: 3 sizes x 3 ratios x 10 seeds x 2 policies = 180 raw rows; 18 summary rows.\n");
puts("CSV: results/generated/policy_experiment_raw.csv");
puts("CSV: results/generated/policy_experiment_summary.csv");
return 0;
}
static int benchmark(void){FILE *f,*summary;FefoStatus s;make_dirs();f=fopen("results/generated/structure_benchmark.csv","w");if(!f){fprintf(stderr,"Unable to create benchmark CSV.\n");return 1;}summary=fopen("results/generated/structure_benchmark_summary.csv","w");if(!summary){(void)fclose(f);fprintf(stderr,"Unable to create benchmark summary CSV.\n");return 1;}s=benchmark_structure(f,summary);if(fclose(f)!=0&&s==FEFO_OK)s=FEFO_ERR_INVALID;if(fclose(summary)!=0&&s==FEFO_OK)s=FEFO_ERR_INVALID;if(s!=FEFO_OK){fprintf(stderr,"Benchmark failed: %s\n",fefo_status_string(s));return 1;}puts("CSV: results/generated/structure_benchmark.csv");puts("CSV: results/generated/structure_benchmark_summary.csv");return 0;}
int main(int argc,char **argv){if(argc<2||!strcmp(argv[1],"help")||!strcmp(argv[1],"--help")){usage(argv[0]);return 0;}if(!strcmp(argv[1],"demo"))return demo();if(!strcmp(argv[1],"simulate")){size_t n=1000U;if(argc>2&&!parse_count(argv[2],&n)){fprintf(stderr,"Batch count must be 1..100000.\n");return 2;}return simulate(n);}if(!strcmp(argv[1],"experiment"))return experiment();if(!strcmp(argv[1],"benchmark"))return benchmark();fprintf(stderr,"Unknown command: %s\n",argv[1]);usage(argv[0]);return 2;}
