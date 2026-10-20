__attribute__((visibility("default"))) int appunpack_score(int value) {
    return value * 7 + 3;
}

__attribute__((visibility("default"))) int appunpack_sum(int count) {
    int total = 0;
    for (int index = 1; index <= count; index++) total += index;
    return total;
}
