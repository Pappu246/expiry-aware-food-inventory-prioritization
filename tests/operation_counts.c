#include "fefo/engine.h"
#include <stdio.h>
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
int main(void){
FILE *f;FefoStatus status;
make_dirs();
f=fopen("results/generated/structure_operation_counts.csv","w");
if(!f){fprintf(stderr,"Unable to create operation-count CSV.\n");return 1;}
status=benchmark_operation_counts(f);
if(fclose(f)!=0&&status==FEFO_OK)status=FEFO_ERR_INVALID;
if(status!=FEFO_OK){fprintf(stderr,"Operation-count pass failed: %s\n",fefo_status_string(status));return 1;}
puts("CSV: results/generated/structure_operation_counts.csv");
return 0;
}
